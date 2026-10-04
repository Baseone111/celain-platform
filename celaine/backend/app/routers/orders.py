import hashlib
import hmac
import io
import json
import time
import zipfile
from typing import Annotated
from fastapi import APIRouter, Header, HTTPException, Request, Response
from pydantic import ValidationError
from sqlalchemy import or_, select, update
from sqlalchemy.exc import IntegrityError
from ..config import settings
from ..models import Idea, Order, PaymentEvent, utcnow
from ..schemas import OrderInput, OrderOut, PaymentInput
from ..security import CurrentUser, Db
from ..serializers import order_out
from ..services import fulfill_order, place_order
from .ideas import stored_file

router = APIRouter(tags=['Orders and licenses'])

@router.post('/orders',response_model=OrderOut,status_code=201)
def create_order(data: OrderInput,db: Db,user: CurrentUser,
                 idempotency_key: Annotated[str,Header(min_length=8,max_length=80)]):
    try:
        order = place_order(db,user,data.idea_id,idempotency_key)
    except IntegrityError:
        db.rollback()
        order = db.scalar(select(Order).where(Order.buyer_id == user.id,Order.idempotency_key == idempotency_key))
        if not order or order.idea_id != data.idea_id:
            raise HTTPException(409,'The order changed in another request. Please try again.')
    return order_out(order)

@router.get('/orders',response_model=list[OrderOut])
def orders(db: Db,user: CurrentUser):
    rows = db.scalars(select(Order).where(or_(Order.buyer_id == user.id,Order.seller_id == user.id)).order_by(Order.created_at.desc()).limit(100))
    return [order_out(order) for order in rows]

def buyer_order(db,user,order_id):
    order = db.scalar(select(Order).where(Order.id == order_id,Order.buyer_id == user.id).with_for_update())
    if not order:
        raise HTTPException(404,'Order not found')
    return order

@router.post('/orders/{order_id}/cancel',status_code=204)
def cancel(order_id: str,db: Db,user: CurrentUser):
    order = buyer_order(db,user,order_id)
    if order.status != 'pending':
        raise HTTPException(409,'Only pending orders can be cancelled')
    order.status = 'cancelled'
    db.execute(update(Idea).where(Idea.id == order.idea_id,Idea.reserved_order_id == order.id)
               .values(reserved_order_id=None,reserved_until=None))
    db.commit()

@router.post('/orders/{order_id}/demo-pay',response_model=OrderOut)
def demo_payment(order_id: str,db: Db,user: CurrentUser):
    if not settings.demo_payments or settings.environment == 'production':
        raise HTTPException(404,'Demo checkout is disabled')
    order = fulfill_order(db,buyer_order(db,user,order_id))
    db.commit()
    return order_out(order)

@router.get('/orders/{order_id}/download')
def download(order_id: str,db: Db,user: CurrentUser):
    order = buyer_order(db,user,order_id)
    if order.status != 'paid':
        raise HTTPException(403,'A paid license is required to download this idea')
    package = io.BytesIO()
    license_record = {key:value for key,value in order_out(order).items()}
    with zipfile.ZipFile(package,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('license.json',json.dumps(license_record,indent=2))
        archive.writestr('lyrics.txt',order.lyrics_snapshot)
        archive.writestr('license.txt',f'CELAINE LICENSE\n{order.idea_title}\nOrder: {order.id}\n\n{order.license_terms}')
        if order.original_path_snapshot:
            file = stored_file(order.original_path_snapshot)
            archive.write(file,f'original{file.suffix}')
    return Response(package.getvalue(),media_type='application/zip',
                    headers={'Content-Disposition':f'attachment; filename="celaine-{order.id}.zip"','Cache-Control':'no-store'})

@router.post('/payments/webhook')
async def payment_webhook(request: Request,db: Db,
                           x_celaine_timestamp: Annotated[str,Header()],x_celaine_signature: Annotated[str,Header()]):
    # A trusted payment-provider adapter calls this AFTER verifying its provider's event.
    # No secret and no provider configuration means no real payment fulfillment.
    if len(settings.payment_webhook_secret) < 32:
        raise HTTPException(503,'Payment confirmation is not configured')
    try:
        timestamp = int(x_celaine_timestamp)
    except ValueError:
        raise HTTPException(401,'Invalid payment signature')
    if abs(time.time()-timestamp) > 300:
        raise HTTPException(401,'Payment signature has expired')
    body = await request.body()
    if len(body) > 10000:
        raise HTTPException(413,'Payment event is too large')
    expected = hmac.new(settings.payment_webhook_secret.encode(),x_celaine_timestamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected,x_celaine_signature):
        raise HTTPException(401,'Invalid payment signature')
    try:
        event = PaymentInput.model_validate_json(body)
    except ValidationError:
        raise HTTPException(422,'Invalid payment event')
    order = db.scalar(select(Order).where(Order.id == event.order_id).with_for_update())
    if not order:
        raise HTTPException(404,'Order not found')
    if order.amount_cents != event.amount_cents or order.currency != event.currency:
        raise HTTPException(409,'Payment amount or currency does not match the order')
    previous = db.get(PaymentEvent,event.event_id)
    if previous:
        if previous.order_id != order.id:
            raise HTTPException(409,'Event ID has already been used for a different order')
        return {'received':True,'duplicate':True}
    db.add(PaymentEvent(id=event.event_id,order_id=order.id))
    try:
        fulfill_order(db,order)
        db.commit()
    except IntegrityError:
        db.rollback()
        previous = db.get(PaymentEvent,event.event_id)
        if previous and previous.order_id == order.id:
            return {'received':True,'duplicate':True}
        raise HTTPException(409,'Payment event conflict')
    return {'received':True,'duplicate':False}
