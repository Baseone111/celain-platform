import re
import secrets
from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from ..models import RefreshSession, User
from ..schemas import AuthOut, LoginInput, RegisterInput, UserOut
from ..security import COOKIE_NAME, COOKIE_PATH, CurrentUser, DUMMY_HASH, Db, check_origin, create_session, passwords, rotate_session, token_hash
from ..serializers import user_out

router = APIRouter(prefix='/auth',tags=['Authentication'])

@router.post('/register',response_model=AuthOut,status_code=201)
def register(data: RegisterInput,request: Request,response: Response,db: Db):
    check_origin(request)
    user = User(email=str(data.email).lower(),display_name=data.display_name,
                username=(re.sub(r'[^a-z0-9]','',data.display_name.lower())[:50] or 'writer') + secrets.token_hex(3),
                password_hash=passwords.hash(data.password))
    db.add(user)
    try:
        db.flush()
        token = create_session(db,user,response)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409,'An account with this email already exists')
    return {'access_token':token,'user':user_out(db,user,user)}

@router.post('/login',response_model=AuthOut)
def login(data: LoginInput,request: Request,response: Response,db: Db):
    check_origin(request)
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    valid = passwords.verify(data.password,user.password_hash if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401,'Email or password is incorrect')
    return {'access_token':create_session(db,user,response),'user':user_out(db,user,user)}

@router.post('/refresh')
def refresh(request: Request,response: Response,db: Db):
    return {'access_token':rotate_session(db,request,response),'token_type':'bearer'}

@router.post('/logout',status_code=204)
def logout(request: Request,response: Response,db: Db):
    check_origin(request)
    raw = request.cookies.get(COOKIE_NAME)
    if raw:
        db.execute(update(RefreshSession).where(RefreshSession.token_hash == token_hash(raw)).values(revoked=True))
        db.commit()
    response.delete_cookie(COOKIE_NAME,path=COOKIE_PATH,secure=False,httponly=True,samesite='strict')

@router.get('/me',response_model=UserOut)
def me(user: CurrentUser,db: Db):
    return user_out(db,user,user)
