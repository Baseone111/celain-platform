from collections import defaultdict, deque
from contextlib import asynccontextmanager
from time import monotonic
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from .config import settings
from .database import engine
from .routers import auth, community, ideas, orders

@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.storage_dir.mkdir(parents=True,exist_ok=True)
    yield

app = FastAPI(title='Celaine API',version='1.0.0',description='A songwriter workspace and licensed music-idea marketplace.',lifespan=lifespan)
app.add_middleware(CORSMiddleware,allow_origins=settings.origins,allow_credentials=True,
                   allow_methods=['GET','POST','PATCH','PUT','DELETE'],allow_headers=['Authorization','Content-Type','Idempotency-Key'])
for router in [auth.router,ideas.router,community.router,orders.router]:
    app.include_router(router,prefix='/api/v1')

@app.get('/api/v1/health',tags=['System'])
def health():
    with engine.connect() as connection:
        connection.execute(text('SELECT 1'))
    return {'status':'ok','demo_payments':settings.demo_payments and settings.environment != 'production'}

# Development defense only. Use a shared Redis or ingress limiter before scaling workers.
request_windows = defaultdict(deque)

@app.middleware('http')
async def security_headers(request: Request,call_next):
    if request.url.path.startswith('/api/v1/auth/login') or request.url.path.startswith('/api/v1/auth/register'):
        now = monotonic()
        key = (request.client.host if request.client else 'unknown',request.url.path)
        recent = request_windows[key]
        while recent and recent[0] < now-60:
            recent.popleft()
        if len(recent) >= 30:
            return JSONResponse({'detail':'Too many sign-in attempts. Try again in a minute.'},status_code=429,headers={'Retry-After':'60'})
        recent.append(now)
        if len(request_windows)>10000:
            request_windows.clear()
    response = await call_next(request)
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    if request.url.path.startswith('/api/v1') and 'Cache-Control' not in response.headers:
        response.headers['Cache-Control'] = 'no-store'
    return response
