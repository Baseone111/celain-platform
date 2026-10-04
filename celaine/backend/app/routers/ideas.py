import hashlib
import hmac
import io
from pathlib import Path
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from mutagen import File as AudioFile
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from ..config import settings
from ..models import Comment, Idea, Interaction, Order, Reaction, User, utcnow
from ..schemas import CommentInput, EventInput, IdeaInput, IdeaOut, ReactionInput
from ..security import CurrentUser, Db, OptionalUser
from ..serializers import idea_out, idea_outputs, iso, user_out
from ..services import licensed, notify, owned_idea, require_editable, validate_publish, visible_idea

router = APIRouter(prefix='/ideas',tags=['Music ideas'])

@router.get('',response_model=list[IdeaOut])
def list_ideas(db: Db,user: OptionalUser,scope: Literal['discover','mine','saved']='discover',
               q: str = Query(default='',max_length=100),genre: str = Query(default='',max_length=50),
               limit: int = Query(default=30,ge=1,le=100),offset: int = Query(default=0,ge=0,le=10000)):
    statement = select(Idea)
    if scope == 'mine':
        if not user:
            raise HTTPException(401,'Sign in to your workspace')
        statement = statement.where(Idea.creator_id == user.id)
    else:
        statement = statement.where(Idea.status.in_(['published','sold']))
        if scope == 'saved':
            if not user:
                raise HTTPException(401,'Sign in to your workspace')
            statement = statement.join(Reaction).where(Reaction.user_id == user.id,Reaction.kind == 'save')
    if q:
        # User characters are bound parameters, not SQL fragments; escape wildcard syntax.
        pattern = '%' + q.replace('\\','\\\\').replace('%','\\%').replace('_','\\_') + '%'
        statement = statement.join(User,Idea.creator_id == User.id).where(or_(Idea.title.ilike(pattern,escape='\\'),
                         Idea.description.ilike(pattern,escape='\\'),User.display_name.ilike(pattern,escape='\\')))
    if genre:
        statement = statement.where(Idea.genre == genre)
    ideas = list(db.scalars(statement.order_by(Idea.created_at.desc()).limit(limit).offset(offset)))
    return idea_outputs(db,ideas,user)

@router.post('',response_model=IdeaOut,status_code=201)
def create_idea(data: IdeaInput,db: Db,user: CurrentUser):
    idea = Idea(**data.model_dump(),creator_id=user.id)
    validate_publish(idea)
    db.add(idea)
    db.commit()
    return idea_out(db,idea,user)

@router.get('/{idea_id}',response_model=IdeaOut)
def get_idea(idea_id: str,db: Db,user: OptionalUser):
    return idea_out(db,visible_idea(db,idea_id,user),user)

@router.patch('/{idea_id}',response_model=IdeaOut)
def update_idea(idea_id: str,data: IdeaInput,db: Db,user: CurrentUser):
    idea = owned_idea(db,idea_id,user)
    require_editable(db,idea)
    for field,value in data.model_dump().items():
        setattr(idea,field,value)
    validate_publish(idea)
    db.commit()
    return idea_out(db,idea,user)

@router.delete('/{idea_id}',status_code=204)
def archive_idea(idea_id: str,db: Db,user: CurrentUser):
    idea = owned_idea(db,idea_id,user)
    if db.scalar(select(Order.id).where(Order.idea_id == idea_id,Order.status == 'pending',Order.expires_at > utcnow())):
        raise HTTPException(409,'This idea has a pending purchase. Wait for it to complete or expire.')
    idea.status = 'archived'
    db.commit()

@router.put('/{idea_id}/reactions/{kind}',response_model=IdeaOut)
def react(idea_id: str,kind: Literal['like','save'],data: ReactionInput,db: Db,user: CurrentUser):
    idea = visible_idea(db,idea_id,user)
    old = db.scalar(select(Reaction).where(Reaction.user_id == user.id,Reaction.idea_id == idea.id,Reaction.kind == kind))
    if old and not data.active:
        db.delete(old)
    elif not old and data.active:
        db.add(Reaction(user_id=user.id,idea_id=idea.id,kind=kind))
        if idea.creator_id != user.id:
            notify(db,idea.creator_id,kind,f'{user.display_name} {"saved" if kind == "save" else "liked"} your idea “{idea.title}”.',idea.id)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # A concurrent identical PUT already established the requested state.
        existing = db.scalar(select(Reaction).where(Reaction.user_id == user.id,Reaction.idea_id == idea.id,Reaction.kind == kind))
        if bool(existing) != data.active:
            raise HTTPException(409,'This reaction changed in another request. Refresh and try again.')
    return idea_out(db,idea,user)

@router.post('/{idea_id}/events')
def interaction(idea_id: str,data: EventInput,request: Request,db: Db,user: OptionalUser):
    idea = visible_idea(db,idea_id,user)
    if user and idea.creator_id == user.id:
        return {'recorded':False}
    day = utcnow().date().isoformat()
    # Anonymous IPs are never persisted. Daily HMAC deduplicates without a stable cross-day identifier.
    actor = user.id if user else hmac.new(settings.jwt_secret.encode(),f'{request.client.host if request.client else "unknown"}:{day}'.encode(),hashlib.sha256).hexdigest()
    db.add(Interaction(idea_id=idea.id,actor_key=actor,kind=data.kind,day=day))
    try:
        db.commit()
        return {'recorded':True}
    except IntegrityError:
        db.rollback()
        return {'recorded':False}

@router.get('/{idea_id}/comments')
def list_comments(idea_id: str,db: Db,user: OptionalUser,limit: int=Query(default=50,ge=1,le=100)):
    visible_idea(db,idea_id,user)
    rows = db.execute(select(Comment,User).join(User,Comment.user_id == User.id).where(Comment.idea_id == idea_id)
                      .order_by(Comment.created_at.desc()).limit(limit)).all()
    return [{'id':comment.id,'body':comment.body,'author':user_out(db,author,user),'created_at':iso(comment.created_at)}
            for comment,author in reversed(rows)]

@router.post('/{idea_id}/comments',status_code=201)
def add_comment(idea_id: str,data: CommentInput,db: Db,user: CurrentUser):
    idea = visible_idea(db,idea_id,user)
    comment = Comment(idea_id=idea_id,user_id=user.id,body=data.body)
    db.add(comment)
    if idea.creator_id != user.id:
        notify(db,idea.creator_id,'comment',f'{user.display_name} left feedback on “{idea.title}”.',idea.id)
    db.commit()
    return {'id':comment.id,'body':comment.body,'author':user_out(db,user,user),'created_at':iso(comment.created_at)}

@router.delete('/{idea_id}/comments/{comment_id}',status_code=204)
def delete_comment(idea_id: str,comment_id: str,db: Db,user: CurrentUser):
    comment = db.get(Comment,comment_id)
    if not comment or comment.idea_id != idea_id or comment.user_id != user.id:
        raise HTTPException(404,'Comment not found')
    db.delete(comment)
    db.commit()

def stored_file(name: str | None):
    if not name:
        raise HTTPException(404,'No audio is attached to this idea')
    root = settings.storage_dir.resolve()
    path = (root/name).resolve()
    if path.parent != root or not path.is_file():
        raise HTTPException(404,'Audio file not found')
    return path

@router.post('/{idea_id}/audio',response_model=IdeaOut)
def upload_audio(idea_id: str,db: Db,user: CurrentUser,file: UploadFile = File(...),kind: Literal['preview','original']=Query(default='preview')):
    idea = owned_idea(db,idea_id,user)
    require_editable(db,idea)
    content = bytearray()
    while chunk := file.file.read(64*1024):
        content.extend(chunk)
        if len(content) > settings.max_upload_bytes:
            raise HTTPException(413,'Audio files must be under 20 MB')
    raw = bytes(content)
    if raw.startswith(b'RIFF') and raw[8:12] == b'WAVE':
        extension = 'wav'
    elif raw.startswith(b'OggS'):
        extension = 'ogg'
    elif raw.startswith(b'ID3') or len(raw)>2 and raw[0] == 255 and raw[1] & 224 == 224:
        extension = 'mp3'
    else:
        raise HTTPException(415,'Please upload a valid MP3, WAV, or OGG file')
    try:
        parsed = AudioFile(io.BytesIO(raw))
        seconds = parsed.info.length if parsed is not None else 0
        if not seconds or seconds > 3600:
            raise ValueError('Invalid duration')
    except Exception:
        raise HTTPException(415,'The audio file could not be read')
    if kind == 'preview' and seconds > 90:
        raise HTTPException(422,'Public previews must be 90 seconds or shorter. Upload full material as original audio.')
    settings.storage_dir.mkdir(parents=True,exist_ok=True)
    filename = f'{uuid4()}.{extension}'
    path = settings.storage_dir/filename
    path.write_bytes(raw)
    previous = idea.preview_path if kind == 'preview' else idea.original_path
    if kind == 'preview':
        idea.preview_path = filename
        idea.duration_seconds = round(seconds)
    else:
        idea.original_path = filename
    try:
        db.commit()
    except Exception:
        path.unlink(missing_ok=True)
        raise
    if previous:
        old = settings.storage_dir/previous
        if old.resolve().parent == settings.storage_dir.resolve():
            old.unlink(missing_ok=True)
    return idea_out(db,idea,user)

@router.get('/{idea_id}/preview')
def preview(idea_id: str,db: Db,user: OptionalUser):
    idea = visible_idea(db,idea_id,user)
    return FileResponse(stored_file(idea.preview_path),headers={'Cache-Control':'private, max-age=60','X-Content-Type-Options':'nosniff'})

@router.get('/{idea_id}/original')
def original(idea_id: str,db: Db,user: CurrentUser):
    idea = visible_idea(db,idea_id,user)
    if idea.creator_id != user.id and not licensed(db,idea_id,user.id):
        raise HTTPException(403,'A paid license is required to download original audio')
    return FileResponse(stored_file(idea.original_path),filename=f'original-{idea.id}{Path(idea.original_path or "").suffix}',
                        headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'})
