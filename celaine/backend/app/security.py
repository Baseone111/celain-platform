import hashlib
import secrets
from datetime import timedelta
from typing import Annotated
import jwt
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .models import RefreshSession, User, utcnow

Db = Annotated[Session, Depends(get_db)]
passwords = PasswordHash.recommended()
bearer = HTTPBearer(auto_error=False)
COOKIE_NAME = 'celaine_refresh'
COOKIE_PATH = '/api/v1/auth'
DUMMY_HASH = passwords.hash(secrets.token_urlsafe(20))

def token_hash(value: str):
    return hashlib.sha256(value.encode()).hexdigest()

def access_token(user_id: str, session_id: str):
    now = utcnow()
    return jwt.encode({'sub': user_id, 'sid': session_id, 'iat': now,
                       'exp': now + timedelta(minutes=settings.access_token_minutes),
                       'aud': 'celaine', 'iss': 'celaine-api'}, settings.jwt_secret, algorithm='HS256')

def session_cookie(response: Response, raw: str):
    response.set_cookie(COOKIE_NAME, raw, httponly=True, secure=settings.cookie_secure,
                        samesite='strict', path=COOKIE_PATH, max_age=settings.refresh_days * 86400)

def create_session(db: Session, user: User, response: Response):
    raw = secrets.token_urlsafe(48)
    session = RefreshSession(user_id=user.id, token_hash=token_hash(raw),
                             expires_at=utcnow() + timedelta(days=settings.refresh_days))
    db.add(session)
    db.commit()
    session_cookie(response, raw)
    return access_token(user.id, session.id)

def check_origin(request: Request):
    origin = request.headers.get('origin')
    if origin and origin not in settings.origins:
        raise HTTPException(403, 'Origin not permitted')

def rotate_session(db: Session, request: Request, response: Response):
    check_origin(request)
    raw = request.cookies.get(COOKIE_NAME)
    session = db.scalar(select(RefreshSession).where(RefreshSession.token_hash == token_hash(raw or ''),
                        RefreshSession.revoked == False, RefreshSession.expires_at > utcnow()).with_for_update())
    if not session:
        raise HTTPException(401, 'Sign in to your workspace', headers={'WWW-Authenticate': 'Bearer'})
    replacement = secrets.token_urlsafe(48)
    # CAS protects refresh rotation even on SQLite where SELECT FOR UPDATE is ignored.
    changed = db.execute(update(RefreshSession).where(RefreshSession.id == session.id,
                         RefreshSession.token_hash == token_hash(raw), RefreshSession.revoked == False)
                         .values(token_hash=token_hash(replacement))).rowcount
    if not changed:
        db.rollback()
        raise HTTPException(401, 'Session has already been refreshed')
    db.commit()
    session_cookie(response, replacement)
    return access_token(session.user_id, session.id)

def optional_user(db: Db, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if not credentials:
        return None
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=['HS256'],
                             audience='celaine', issuer='celaine-api', options={'require': ['sub','sid','exp','iat']})
        session = db.get(RefreshSession, payload['sid'])
        user = db.get(User, payload['sub'])
        if not user or not session or session.user_id != user.id or session.revoked or session.expires_at < utcnow():
            raise ValueError('Revoked session')
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, 'Your session has expired. Sign in again.', headers={'WWW-Authenticate': 'Bearer'})

def current_user(user: Annotated[User | None, Depends(optional_user)]):
    if user is None:
        raise HTTPException(401, 'Sign in to your workspace', headers={'WWW-Authenticate': 'Bearer'})
    return user

CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(optional_user)]
