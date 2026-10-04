from datetime import timedelta
from fastapi import HTTPException
from sqlalchemy import exists, or_, select, update
from sqlalchemy.orm import Session
from .models import Idea, Notification, Order, User, utcnow, uid

TERMS = {
 'exclusive': 'Exclusive license to develop and release a song using this idea. The creator retains authorship; this is not a copyright assignment. Song credits and publishing splits require a separate written agreement. No other buyer may license this idea through Celaine.',
 'nonexclusive': 'Nonexclusive license to develop and release a song using this idea. Other buyers may license the same material. The creator retains authorship; this is not a copyright assignment. Song credits and publishing splits require a separate written agreement.'}

def licensed(db: Session,idea_id: str,user_id: str):
    return bool(db.scalar(select(Order.id).where(Order.idea_id == idea_id,Order.buyer_id == user_id,Order.status == 'paid')))

def visible_idea(db: Session,idea_id: str,user: User | None):
    idea = db.get(Idea,idea_id)
    if not idea or (idea.status not in ('published','sold') and (not user or (idea.creator_id != user.id and not licensed(db,idea_id,user.id)))):
        raise HTTPException(404,'Idea not found')
    return idea

def owned_idea(db: Session,idea_id: str,user: User):
    idea = db.scalar(select(Idea).where(Idea.id == idea_id).with_for_update())
    if not idea or idea.creator_id != user.id:
        raise HTTPException(404,'Idea not found')
    return idea

def require_editable(db: Session,idea: Idea):
    locked = db.scalar(select(Order.id).where(Order.idea_id == idea.id,or_(Order.status == 'paid',
                      (Order.status == 'pending') & (Order.expires_at > utcnow()))))
    if locked:
        raise HTTPException(409,'Ideas with an active or paid license cannot be changed. Create a new version instead.')

def validate_publish(idea: Idea):
    if idea.status == 'published':
        if not idea.description.strip() or not (idea.lyrics.strip() or idea.preview_path):
            raise HTTPException(422,'A published idea needs a description and lyrics or an audio preview')
        if idea.price_cents < 100:
            raise HTTPException(422,'License prices start at $1')

def notify(db: Session,user_id: str,kind: str,body: str,idea_id: str | None):
    db.add(Notification(user_id=user_id,kind=kind,body=body[:300],idea_id=idea_id))

def place_order(db: Session,buyer: User,idea_id: str,key: str):
    previous = db.scalar(select(Order).where(Order.buyer_id == buyer.id,Order.idempotency_key == key))
    if previous:
        if previous.idea_id != idea_id:
            raise HTTPException(409,'This idempotency key belongs to a different idea')
        return previous
    idea = db.scalar(select(Idea).where(Idea.id == idea_id).with_for_update())
    if not idea or idea.status != 'published':
        raise HTTPException(409,'This idea is no longer available')
    if idea.creator_id == buyer.id:
        raise HTTPException(400,'You already own this idea')
    existing = db.scalar(select(Order).where(Order.idea_id == idea_id,Order.buyer_id == buyer.id,
                         or_(Order.status == 'paid',(Order.status == 'pending') & (Order.expires_at > utcnow()))))
    if existing:
        return existing
    order_id = uid()
    expiry = utcnow() + timedelta(minutes=30)
    if idea.license_type == 'exclusive':
        # Atomic comparison-and-swap is authoritative, including SQLite development.
        reserved = db.execute(update(Idea).where(Idea.id == idea.id,Idea.status == 'published',
                              or_(Idea.reserved_order_id == None,Idea.reserved_until < utcnow()))
                              .values(reserved_order_id=order_id,reserved_until=expiry)).rowcount
        if not reserved:
            db.rollback()
            raise HTTPException(409,'Another buyer has reserved this exclusive idea. Try again later.')
    order = Order(id=order_id,idea_id=idea.id,buyer_id=buyer.id,seller_id=idea.creator_id,idempotency_key=key,
                  idea_title=idea.title,amount_cents=idea.price_cents,currency=idea.currency,license_type=idea.license_type,
                  license_terms=TERMS[idea.license_type],lyrics_snapshot=idea.lyrics,
                  original_path_snapshot=idea.original_path,expires_at=expiry)
    db.add(order)
    db.commit()
    return order

def fulfill_order(db: Session,order: Order):
    if order.status == 'paid':
        return order
    if order.status != 'pending' or order.expires_at < utcnow():
        raise HTTPException(409,'This order cannot be fulfilled. Refund or reconcile the payment with your provider.')
    if order.license_type == 'exclusive':
        changed = db.execute(update(Idea).where(Idea.id == order.idea_id,Idea.status == 'published',
                             Idea.reserved_order_id == order.id,Idea.reserved_until >= utcnow())
                             .values(status='sold',reserved_until=None)).rowcount
        if not changed:
            raise HTTPException(409,'The exclusive reservation has expired. Reconcile the payment with your provider.')
    changed = db.execute(update(Order).where(Order.id == order.id,Order.status == 'pending').values(status='paid',paid_at=utcnow())).rowcount
    if changed:
        notify(db,order.seller_id,'purchase',f'Your idea “{order.idea_title}” was licensed.',order.idea_id)
        notify(db,order.buyer_id,'purchase',f'Your license for “{order.idea_title}” is ready.',order.idea_id)
    db.flush()
    db.refresh(order)
    return order
