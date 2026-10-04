from datetime import timedelta
from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from ..models import Comment, Follow, Idea, Interaction, Notification, Order, Reaction, User, utcnow
from ..schemas import ProfileInput, UserOut
from ..security import CurrentUser, Db, OptionalUser
from ..serializers import idea_outputs, iso, user_out

router = APIRouter(tags=['Creators and insights'])

@router.get('/users/creators',response_model=list[UserOut])
def creators(db: Db,user: OptionalUser,limit: int=Query(default=20,ge=1,le=100)):
    statement = select(User).where(User.id.in_(select(Idea.creator_id).where(Idea.status.in_(['published','sold']))))
    if user:
        statement = statement.where(User.id != user.id)
    people = db.scalars(statement.order_by(User.display_name).limit(limit))
    return [user_out(db,person,user) for person in people]

@router.get('/users/{user_id}',response_model=UserOut)
def get_creator(user_id: str,db: Db,user: OptionalUser):
    person = db.get(User,user_id)
    if not person:
        raise HTTPException(404,'Writer not found')
    return user_out(db,person,user)

@router.patch('/users/me',response_model=UserOut)
def update_profile(data: ProfileInput,db: Db,user: CurrentUser):
    for key,value in data.model_dump().items():
        setattr(user,key,value)
    db.commit()
    return user_out(db,user,user)

@router.post('/users/{user_id}/follow')
def follow(user_id: str,db: Db,user: CurrentUser):
    if user_id == user.id:
        raise HTTPException(400,'You cannot follow yourself')
    person = db.get(User,user_id)
    if not person:
        raise HTTPException(404,'Writer not found')
    existing = db.scalar(select(Follow).where(Follow.follower_id == user.id,Follow.creator_id == user_id))
    if existing:
        db.delete(existing)
    else:
        db.add(Follow(follower_id=user.id,creator_id=user_id))
        db.add(Notification(user_id=user_id,kind='follow',body=f'{user.display_name} is now following your work.'))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'This follow changed in another request. Refresh and try again.')
    return {'following':not bool(existing)}

@router.get('/notifications')
def notifications(db: Db,user: CurrentUser):
    rows = db.scalars(select(Notification).where(Notification.user_id == user.id).order_by(Notification.created_at.desc()).limit(100))
    return [{'id':n.id,'kind':n.kind,'body':n.body,'idea_id':n.idea_id,'read':n.read,'created_at':iso(n.created_at)} for n in rows]

@router.post('/notifications/read',status_code=204)
def read_notifications(db: Db,user: CurrentUser):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(read=True))
    db.commit()

@router.get('/analytics')
def analytics(db: Db,user: CurrentUser,days: int=Query(default=30,ge=1,le=90)):
    ideas = list(db.scalars(select(Idea).where(Idea.creator_id == user.id)))
    ids = [idea.id for idea in ideas]
    start = utcnow().date() - timedelta(days=days-1)
    daily = {(day,kind):count for day,kind,count in db.execute(select(Interaction.day,Interaction.kind,func.count())
             .where(Interaction.idea_id.in_(ids),Interaction.day >= start.isoformat()).group_by(Interaction.day,Interaction.kind))}
    count = lambda model: db.scalar(select(func.count()).select_from(model).where(model.idea_id.in_(ids))) or 0
    paid = list(db.scalars(select(Order).where(Order.seller_id == user.id,Order.status == 'paid',Order.paid_at >= start)))
    cards = idea_outputs(db,ideas,user)
    return {'views':sum(n for (d,k),n in daily.items() if k == 'view'),
            'plays':sum(n for (d,k),n in daily.items() if k == 'play'),
            'saves':sum(x['saves'] for x in cards),'likes':sum(x['likes'] for x in cards),'comments':count(Comment),
            'revenue_cents':sum(order.amount_cents for order in paid),'licenses':len(paid),
            'daily':[{'date':(start+timedelta(days=i)).isoformat(),
                      'views':daily.get(((start+timedelta(days=i)).isoformat(),'view'),0),
                      'plays':daily.get(((start+timedelta(days=i)).isoformat(),'play'),0)} for i in range(days)],
            'ideas':[{key:card[key] for key in ['id','title','views','plays','saves','likes']} for card in cards]}
