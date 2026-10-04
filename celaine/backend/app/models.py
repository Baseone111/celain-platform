from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base

def uid():
    return str(uuid4())

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)

class User(Base):
    __tablename__ = 'users'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    display_name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(Text)
    bio: Mapped[str] = mapped_column(String(500), default='')
    location: Mapped[str] = mapped_column(String(120), default='')
    avatar_color: Mapped[str] = mapped_column(String(7), default='#c9d8ab')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class RefreshSession(Base):
    __tablename__ = 'refresh_sessions'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked: Mapped[bool] = mapped_column(default=False)

class Idea(Base):
    __tablename__ = 'ideas'
    __table_args__ = (CheckConstraint('price_cents >= 0 AND price_cents <= 1000000', name='idea_price_bounds'),
                     CheckConstraint("license_type IN ('exclusive', 'nonexclusive')", name='idea_license'),
                     CheckConstraint("status IN ('draft', 'published', 'sold', 'archived')", name='idea_status'),
                     Index('ix_ideas_discover', 'status', 'created_at'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    creator_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), index=True)
    title: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default='')
    lyrics: Mapped[str] = mapped_column(Text, default='')
    genre: Mapped[str] = mapped_column(String(50), default='Afropop', index=True)
    mood: Mapped[str] = mapped_column(String(40), default='Dreamy')
    idea_type: Mapped[str] = mapped_column(String(30), default='Hook')
    tags: Mapped[list] = mapped_column(JSON, default=list)
    bpm: Mapped[int | None] = mapped_column(Integer, nullable=True)
    musical_key: Mapped[str] = mapped_column(String(30), default='')
    price_cents: Mapped[int] = mapped_column(Integer, default=3500)
    currency: Mapped[str] = mapped_column(String(3), default='USD')
    license_type: Mapped[str] = mapped_column(String(20), default='nonexclusive')
    status: Mapped[str] = mapped_column(String(16), default='draft')
    cover_color: Mapped[int] = mapped_column(Integer, default=0)
    preview_path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    original_path: Mapped[str | None] = mapped_column(String(200), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, default=0)
    reserved_order_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)

class Reaction(Base):
    __tablename__ = 'reactions'
    __table_args__ = (UniqueConstraint('user_id', 'idea_id', 'kind', name='uq_reaction'),
                     CheckConstraint("kind IN ('like','save')", name='reaction_kind'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    idea_id: Mapped[str] = mapped_column(ForeignKey('ideas.id', ondelete='CASCADE'), index=True)
    kind: Mapped[str] = mapped_column(String(8))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class Interaction(Base):
    __tablename__ = 'interactions'
    __table_args__ = (UniqueConstraint('actor_key', 'idea_id', 'kind', 'day', name='uq_interaction_daily'),
                     CheckConstraint("kind IN ('view','play')", name='interaction_kind'),
                     Index('ix_interactions_analytics', 'idea_id', 'day', 'kind'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    idea_id: Mapped[str] = mapped_column(ForeignKey('ideas.id', ondelete='CASCADE'))
    actor_key: Mapped[str] = mapped_column(String(64))
    kind: Mapped[str] = mapped_column(String(8))
    day: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class Comment(Base):
    __tablename__ = 'comments'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    idea_id: Mapped[str] = mapped_column(ForeignKey('ideas.id', ondelete='CASCADE'), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'))
    body: Mapped[str] = mapped_column(String(1000))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class Follow(Base):
    __tablename__ = 'follows'
    __table_args__ = (UniqueConstraint('follower_id','creator_id', name='uq_follow'),
                     CheckConstraint('follower_id != creator_id', name='follow_not_self'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    follower_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'))
    creator_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)

class Notification(Base):
    __tablename__ = 'notifications'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    idea_id: Mapped[str | None] = mapped_column(ForeignKey('ideas.id', ondelete='SET NULL'), nullable=True)
    kind: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(String(300))
    read: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

class Order(Base):
    __tablename__ = 'orders'
    __table_args__ = (UniqueConstraint('buyer_id','idempotency_key', name='uq_order_idempotency'),
                     CheckConstraint("status IN ('pending','paid','cancelled')", name='order_status'),
                     Index('ix_orders_buyer_idea', 'buyer_id','idea_id','status'))
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    idea_id: Mapped[str] = mapped_column(ForeignKey('ideas.id', ondelete='RESTRICT'), index=True)
    buyer_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), index=True)
    seller_id: Mapped[str] = mapped_column(ForeignKey('users.id', ondelete='RESTRICT'), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(80))
    idea_title: Mapped[str] = mapped_column(String(120))
    amount_cents: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    license_type: Mapped[str] = mapped_column(String(20))
    license_terms: Mapped[str] = mapped_column(Text)
    lyrics_snapshot: Mapped[str] = mapped_column(Text)
    original_path_snapshot: Mapped[str | None] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(12), default='pending')
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

class PaymentEvent(Base):
    __tablename__ = 'payment_events'
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    order_id: Mapped[str] = mapped_column(ForeignKey('orders.id', ondelete='RESTRICT'))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
