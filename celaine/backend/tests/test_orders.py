import hashlib
import hmac
import io
import json
import time
import zipfile
from datetime import timedelta
from app.config import settings
from app.models import Idea,Order,utcnow
from conftest import idea,order,register

def test_orders_are_idempotent_and_freeze_the_licensed_material(client):
    owner,_=register(client)
    buyer,_=register(client,'buyer@example.com')
    song,payload=idea(client,owner)
    first=order(client,buyer,song['id'])
    assert first.status_code==201,first.text
    assert order(client,buyer,song['id']).json()['id']==first.json()['id']
    assert order(client,owner,song['id'],'owner-order-key').status_code==400
    assert client.patch('/api/v1/ideas/'+song['id'],headers=owner,json=payload|{'price_cents':9000}).status_code==409
    paid=client.post('/api/v1/orders/'+first.json()['id']+'/demo-pay',headers=buyer)
    assert paid.json()['status']=='paid'
    assert client.get('/api/v1/ideas/'+song['id'],headers=buyer).json()['lyrics'].endswith('SECRET FULL LYRIC')
    package=client.get('/api/v1/orders/'+first.json()['id']+'/download',headers=buyer)
    with zipfile.ZipFile(io.BytesIO(package.content)) as archive:
        assert archive.read('lyrics.txt').decode()==payload['lyrics']
        assert json.loads(archive.read('license.json'))['amount_cents']==3500
    assert client.patch('/api/v1/ideas/'+song['id'],headers=owner,json=payload|{'lyrics':'changed'}).status_code==409
    assert client.get('/api/v1/orders/'+first.json()['id']+'/download',headers=owner).status_code==404

def test_exclusive_reservation_prevents_two_buyers_and_releases_on_cancel(client):
    owner,_=register(client)
    one,_=register(client,'one@example.com')
    two,_=register(client,'two@example.com')
    song,_=idea(client,owner,license_type='exclusive')
    first=order(client,one,song['id'])
    assert first.status_code==201
    assert order(client,two,song['id']).status_code==409
    assert client.post('/api/v1/orders/'+first.json()['id']+'/cancel',headers=one).status_code==204
    second=order(client,two,song['id'],'second-reservation-key')
    assert second.status_code==201
    assert client.post('/api/v1/orders/'+second.json()['id']+'/demo-pay',headers=two).status_code==200
    assert client.get('/api/v1/ideas/'+song['id']).json()['status']=='sold'
    assert order(client,one,song['id'],'new-key-after-sale').status_code==409

def test_expired_exclusive_order_cannot_unlock_material(client):
    owner,_=register(client)
    buyer,_=register(client,'buyer@example.com')
    song,_=idea(client,owner,license_type='exclusive')
    purchase=order(client,buyer,song['id']).json()
    with client.db_factory() as db:
        db.get(Order,purchase['id']).expires_at=utcnow()-timedelta(minutes=1)
        db.get(Idea,song['id']).reserved_until=utcnow()-timedelta(minutes=1)
        db.commit()
    assert client.post('/api/v1/orders/'+purchase['id']+'/demo-pay',headers=buyer).status_code==409
    assert client.get('/api/v1/orders/'+purchase['id']+'/download',headers=buyer).status_code==403
    assert order(client,buyer,song['id'],'after-expiry-new-key').status_code==201

def test_demo_payment_disabled_when_not_configured(client):
    owner,_=register(client)
    buyer,_=register(client,'buyer@example.com')
    song,_=idea(client,owner)
    purchase=order(client,buyer,song['id']).json()
    settings.demo_payments=False
    assert client.post('/api/v1/orders/'+purchase['id']+'/demo-pay',headers=buyer).status_code==404

def test_payment_signature_amount_and_replay_protection(client):
    owner,_=register(client)
    buyer,_=register(client,'buyer@example.com')
    song,_=idea(client,owner)
    purchase=order(client,buyer,song['id']).json()
    def event(amount=3500,signature=None):
        body=json.dumps({'event_id':'provider-event-1','order_id':purchase['id'],'amount_cents':amount,'currency':'USD','status':'paid'}).encode()
        timestamp=str(int(time.time()))
        signed=hmac.new(settings.payment_webhook_secret.encode(),timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
        return client.post('/api/v1/payments/webhook',content=body,headers={'Content-Type':'application/json','X-Celaine-Timestamp':timestamp,'X-Celaine-Signature':signature or signed})
    assert event(signature='bad').status_code==401
    assert event(amount=1).status_code==409
    assert event().json()=={'received':True,'duplicate':False}
    assert event().json()=={'received':True,'duplicate':True}
    assert client.get('/api/v1/analytics',headers=owner).json()['revenue_cents']==3500
    assert len(client.get('/api/v1/notifications',headers=owner).json())==1
