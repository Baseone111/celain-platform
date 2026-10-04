from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints, field_validator

class StrictInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)

class RegisterInput(StrictInput):
    display_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: Annotated[str, StringConstraints(strip_whitespace=False)] = Field(min_length=10, max_length=128)

class LoginInput(StrictInput):
    email: EmailStr
    password: Annotated[str, StringConstraints(strip_whitespace=False)] = Field(min_length=1, max_length=128)

class ProfileInput(StrictInput):
    display_name: str = Field(min_length=2,max_length=80)
    bio: str = Field(default='',max_length=500)
    location: str = Field(default='',max_length=120)

class IdeaInput(StrictInput):
    title: str = Field(min_length=1,max_length=120)
    description: str = Field(default='',max_length=2000)
    lyrics: str = Field(default='',max_length=20000)
    genre: Literal['Afropop','R&B / Soul','Indie pop','Acoustic','Hip-hop','Electronic'] = 'Afropop'
    mood: Literal['Dreamy','Uplifting','Introspective','Romantic','Melancholic','Energetic'] = 'Dreamy'
    idea_type: Literal['Hook','Lyrics','Song sketch'] = 'Hook'
    tags: list[str] = Field(default_factory=list,max_length=8)
    bpm: int | None = Field(default=None,ge=30,le=300)
    musical_key: str = Field(default='',max_length=30)
    price_cents: int = Field(default=3500,ge=0,le=1000000)
    currency: Literal['USD'] = 'USD'
    license_type: Literal['exclusive','nonexclusive'] = 'nonexclusive'
    status: Literal['draft','published'] = 'draft'
    cover_color: int = Field(default=0,ge=0,le=5)

    @field_validator('tags')
    @classmethod
    def valid_tags(cls,values):
        if any(not value.strip() or len(value)>30 for value in values):
            raise ValueError('Tags must contain 1 to 30 characters')
        return list(dict.fromkeys(value.strip() for value in values))

class CommentInput(StrictInput):
    body: str = Field(min_length=1,max_length=1000)

class EventInput(StrictInput):
    kind: Literal['view','play']

class ReactionInput(StrictInput):
    active: bool

class OrderInput(StrictInput):
    idea_id: str = Field(min_length=1,max_length=36)

class PaymentInput(StrictInput):
    event_id: str = Field(min_length=1,max_length=100)
    order_id: str = Field(min_length=1,max_length=36)
    amount_cents: int = Field(ge=0)
    currency: Literal['USD']
    status: Literal['paid']

class UserOut(BaseModel):
    id: str
    display_name: str
    username: str
    bio: str
    location: str
    avatar_color: str
    followers: int
    following: bool
    email: str | None = None

class AuthOut(BaseModel):
    access_token: str
    token_type: str = 'bearer'
    user: UserOut

class IdeaOut(BaseModel):
    id: str
    creator: UserOut
    title: str
    description: str
    lyrics: str | None = None
    lyrics_excerpt: str
    genre: str
    mood: str
    idea_type: str
    tags: list[str]
    bpm: int | None
    musical_key: str
    duration_seconds: int
    price_cents: int
    currency: str
    license_type: str
    status: str
    cover_color: int
    preview_url: str | None
    has_original: bool
    created_at: str
    updated_at: str
    views: int
    plays: int
    likes: int
    saves: int
    comments_count: int
    liked: bool
    saved: bool
    available: bool

class OrderOut(BaseModel):
    id: str
    idea_id: str
    idea_title: str
    buyer_id: str
    seller_id: str
    amount_cents: int
    currency: str
    license_type: str
    license_terms: str
    status: str
    created_at: str
    paid_at: str | None
