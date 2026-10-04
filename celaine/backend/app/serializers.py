from sqlalchemy import func, select
from sqlalchemy.orm import Session
from .models import Comment, Follow, Idea, Interaction, Order, Reaction, User, utcnow

def iso(value):
    return value.isoformat() + 'Z' if value else None

def user_out(db: Session, user: User, viewer: User | None = None):
    return {'id': user.id, 'display_name': user.display_name, 'username': user.username,
            'bio': user.bio, 'location': user.location, 'avatar_color': user.avatar_color,
            'followers': db.scalar(select(func.count()).select_from(Follow).where(Follow.creator_id == user.id)) or 0,
            'following': bool(viewer and db.scalar(select(Follow.id).where(Follow.creator_id == user.id, Follow.follower_id == viewer.id))),
            'email': user.email if viewer and viewer.id == user.id else None}

def idea_outputs(db: Session, ideas: list[Idea], viewer: User | None):
    """Aggregate interactions in batches rather than running one count per card."""
    if not ideas:
        return []
    ids = [idea.id for idea in ideas]
    authors = {u.id: u for u in db.scalars(select(User).where(User.id.in_({x.creator_id for x in ideas})))}
    events = {(idea, kind): count for idea,kind,count in db.execute(select(Interaction.idea_id, Interaction.kind, func.count())
                  .where(Interaction.idea_id.in_(ids)).group_by(Interaction.idea_id, Interaction.kind))}
    reactions = {(idea, kind): count for idea,kind,count in db.execute(select(Reaction.idea_id, Reaction.kind, func.count())
                  .where(Reaction.idea_id.in_(ids)).group_by(Reaction.idea_id, Reaction.kind))}
    comments = dict(db.execute(select(Comment.idea_id,func.count()).where(Comment.idea_id.in_(ids)).group_by(Comment.idea_id)).all())
    own_reactions = set(db.execute(select(Reaction.idea_id,Reaction.kind).where(Reaction.idea_id.in_(ids), Reaction.user_id == viewer.id)).all()) if viewer else set()
    licensed = set(db.scalars(select(Order.idea_id).where(Order.idea_id.in_(ids),Order.buyer_id == viewer.id,Order.status == 'paid'))) if viewer else set()
    author_views = {key:user_out(db,author,viewer) for key,author in authors.items()}
    result = []
    for idea in ideas:
        full = viewer and (viewer.id == idea.creator_id or idea.id in licensed)
        # Private paths and full lyrics never appear in anonymous card responses.
        result.append({'id':idea.id, 'creator':author_views[idea.creator_id], 'title':idea.title,
                       'description':idea.description, 'lyrics':idea.lyrics if full else None,
                       'lyrics_excerpt':'\n'.join(idea.lyrics.splitlines()[:4]),
                       'genre':idea.genre,'mood':idea.mood,'idea_type':idea.idea_type,'tags':idea.tags,
                       'bpm':idea.bpm,'musical_key':idea.musical_key,'duration_seconds':idea.duration_seconds,
                       'price_cents':idea.price_cents,'currency':idea.currency,'license_type':idea.license_type,
                       'status':idea.status,'cover_color':idea.cover_color,
                       'preview_url':f'/api/v1/ideas/{idea.id}/preview' if idea.preview_path else None,
                       'has_original':bool(idea.original_path), 'created_at':iso(idea.created_at),'updated_at':iso(idea.updated_at),
                       'views':events.get((idea.id,'view'),0),'plays':events.get((idea.id,'play'),0),
                       'likes':reactions.get((idea.id,'like'),0),'saves':reactions.get((idea.id,'save'),0),
                       'comments_count':comments.get(idea.id,0),'liked':(idea.id,'like') in own_reactions,
                       'saved':(idea.id,'save') in own_reactions,
                       'available':idea.status == 'published' and (idea.license_type != 'exclusive' or not idea.reserved_order_id or bool(idea.reserved_until and idea.reserved_until < utcnow()))})
    return result

def idea_out(db,idea,viewer):
    return idea_outputs(db,[idea],viewer)[0]

def order_out(order: Order):
    return {key:getattr(order,key) for key in ['id','idea_id','idea_title','buyer_id','seller_id','amount_cents','currency','license_type','license_terms','status']} | {'created_at':iso(order.created_at),'paid_at':iso(order.paid_at)}
