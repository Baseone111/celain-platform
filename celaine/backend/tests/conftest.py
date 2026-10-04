import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.config import settings
from app.database import Base, get_db
from app.main import app, request_windows

@pytest.fixture
def client(tmp_path):
    engine = create_engine('sqlite://',connect_args={'check_same_thread':False},poolclass=StaticPool)
    @event.listens_for(engine,'connect')
    def foreign_keys(connection,_):
        connection.execute('PRAGMA foreign_keys=ON')
    Base.metadata.create_all(engine)
    factory = sessionmaker(engine,expire_on_commit=False)
    def override():
        with factory() as db:
            try:
                yield db
            except Exception:
                db.rollback()
                raise
    app.dependency_overrides[get_db] = override
    previous = (settings.storage_dir,settings.demo_payments,settings.payment_webhook_secret)
    settings.storage_dir = tmp_path
    settings.demo_payments = True
    settings.payment_webhook_secret = 'payment-test-secret-' + 'x'*32
    request_windows.clear()
    with TestClient(app) as value:
        value.db_factory = factory
        yield value
    settings.storage_dir,settings.demo_payments,settings.payment_webhook_secret = previous
    app.dependency_overrides.clear()
    engine.dispose()

def register(client,email='owner@example.com',name='Original Writer'):
    response = client.post('/api/v1/auth/register',json={'display_name':name,'email':email,'password':'strong-password-123'})
    assert response.status_code == 201,response.text
    return {'Authorization':'Bearer '+response.json()['access_token']},response.json()['user']

def idea(client,headers,**changes):
    payload = {'title':'An original idea','description':'A hopeful melody for the next chapter.',
               'lyrics':'First public line\nSecond public line\nThird public line\nFourth public line\nSECRET FULL LYRIC',
               'genre':'Afropop','status':'published','price_cents':3500}
    payload.update(changes)
    response = client.post('/api/v1/ideas',headers=headers,json=payload)
    assert response.status_code == 201,response.text
    return response.json(),payload

def order(client,headers,idea_id,key='unique-order-key-01'):
    return client.post('/api/v1/orders',headers=headers|{'Idempotency-Key':key},json={'idea_id':idea_id})
