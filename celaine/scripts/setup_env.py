"""Create development environment files with fresh secrets; never overwrite existing files."""
import secrets
from pathlib import Path
root=Path(__file__).resolve().parents[1]
secret=secrets.token_urlsafe(48)
database_secret=secrets.token_urlsafe(24)
files={
 root/'.env':f'POSTGRES_PASSWORD={database_secret}\nJWT_SECRET={secret}\nENVIRONMENT=development\nCOOKIE_SECURE=false\nDEMO_SEED=true\nDEMO_PAYMENTS=false\nPAYMENT_WEBHOOK_SECRET=\n',
 root/'backend'/'.env':f'ENVIRONMENT=development\nDATABASE_URL=sqlite:///./celaine.db\nJWT_SECRET={secret}\nCORS_ORIGINS=http://localhost:4173,http://127.0.0.1:4173\nCOOKIE_SECURE=false\nDEMO_PAYMENTS=false\nPAYMENT_WEBHOOK_SECRET=\nSTORAGE_DIR=./storage\n'}
for path,contents in files.items():
    if path.exists():
        print(f'Kept existing {path.name} in {path.parent.name}')
        continue
    with path.open('x') as handle:
        handle.write(contents)
    path.chmod(0o600)
    print(f'Created {path.name} in {path.parent.name}')
