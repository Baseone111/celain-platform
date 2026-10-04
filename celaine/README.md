# Celaine

A React + FastAPI workspace for songwriters to capture original music ideas, discover other writers, and license material for new songs.

The interface uses Lucide icons, bundled DM Sans and Manrope fonts, Instrument Serif cover typography, a dark green theme, keyboard-accessible dialogs, and layouts that reflow for phones, tablets, and desktops.

## What works

- Discovery with text search, genre, mood, idea-type and license filters; trending and recent sorting.
- Audio previews with play/pause, seeking, volume, shuffle, repeat and track navigation.
- A writing studio for lyrics, descriptions, tags, tempo, musical key and audio attachments.
- Private drafts, publishing, archival and restoration through the editor.
- Likes, saved collections, creator profiles, follows, comments and notifications.
- Creator analytics for daily views/plays, current likes/saves, and completed license revenue.
- Nonexclusive and exclusive purchase orders, immutable license snapshots and protected ZIP downloads.
- Account registration/login, Argon2 password hashing, short-lived access tokens and rotating httpOnly refresh cookies.
- SQLAlchemy models, Alembic migrations, PostgreSQL configuration, a SQLite development path, and Docker Compose.

## Two execution modes

| Mode              | Data                                                      | Payments                                                   | Intended use                        |
| ----------------- | --------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------- |
| Frontend demo     | Fictional fixtures and changes saved in this browser      | Simulated only                                             | Explore and review the product      |
| Connected FastAPI | Persistent relational database and protected media volume | Orders remain pending until confirmed by a trusted adapter | Develop and run your own deployment |

The published preview is the frontend demo. The Python API is included as source and runs separately. The demo contains full fixture material in its source; it is not a security boundary for real songwriting files. Its writers, metrics and 18-second synthesized previews are fictional.

Real payment collection, refunds and seller payouts are **not integrated**. With `DEMO_PAYMENTS=false`, buying creates a pending order and unlocks nothing. License wording is a product example that must be replaced with the platform's approved commercial contracts.

## Quick start: review the React demo

Requirements: Node.js 22 or newer.

```bash
npm ci
npm run dev
```

Open http://localhost:4173. There is no sign-in requirement in demo mode. “Help & getting started” explains the workspace and provides a reset action.

## Quick start: connected Docker development

Requirements: Docker with Compose, and Python 3 to generate environment files.

```bash
python3 scripts/setup_env.py
docker compose up --build
```

Open http://localhost:4173 and sign in with the **development-only** fixture account:

- Email: `jamie@example.com`
- Password: `CelaineDemo2026!`

The API docs are at http://localhost:8000/docs. Other fixture writers are `amara@example.com`, `noah@example.com`, `eli@example.com` and `lena@example.com`, with the same sample password. Fixtures must be disabled before a real launch.

The setup script creates random secrets and preserves any existing `.env` files. Docker serves the real frontend with `VITE_DEMO_MODE=false`; Nginx forwards `/api/` to FastAPI. PostgreSQL and media use named volumes. Host ports bind to loopback for local development.

To test simulated fulfillment against the real API, explicitly set `DEMO_PAYMENTS=true` in the root `.env` and recreate the API container. This switch is rejected in production. No money is collected.

## Run the API without Docker

Requirements: Python 3.12 or newer.

From the project root:

```bash
python3 scripts/setup_env.py
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-lock.txt
alembic upgrade head
python -m app.seed
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

On Windows, activate with `.venv\Scripts\activate` and use `python` in place of `python3`.

In a second terminal, from the project root:

```bash
cp .env.frontend.example .env.local
npm ci
npm run dev
```

The Vite development proxy sends `/api/` requests to the local API. Remove `.env.local` and restart Vite to return to the standalone demo. For a separately hosted API, set `VITE_API_URL` to its origin and include the frontend origin in `CORS_ORIGINS`; same-site hosting is recommended for refresh cookies.

## Source map

| Path                             | Responsibility                                                           |
| -------------------------------- | ------------------------------------------------------------------------ |
| `src/App.tsx`                    | Navigation, workspace actions, product views and playback                |
| `src/components/primitives.tsx`  | Accessible dialogs, avatars, covers and empty states                     |
| `src/components/Editors.tsx`     | Songwriting and profile editors                                          |
| `src/api.ts`                     | Typed API client, refresh coordination and explicitly local demo adapter |
| `src/types.ts`                   | Frontend data contracts and formatting helpers                           |
| `src/seed.ts`                    | Fictional demo workspace                                                 |
| `src/styles.css`                 | Theme, component styles and responsive rules                             |
| `backend/app/routers/`           | Authentication, idea, community and order endpoints                      |
| `backend/app/services.py`        | Ownership checks, publication rules, reservations and fulfillment        |
| `backend/app/serializers.py`     | Response filtering and batched interaction counts                        |
| `backend/app/models.py`          | Relational schema and database constraints                               |
| `backend/alembic/versions/`      | Explicit database migration history                                      |
| `tests/ui/` and `backend/tests/` | Client journeys and API access/commerce checks                           |
| `docs/ARCHITECTURE.md`           | Database design and domain decisions                                     |
| `docs/PAYMENTS.md`               | Trusted payment-adapter contract                                         |
| `docs/VERIFICATION.md`           | Completed checks and verification limits                                 |

## Verify changes

```bash
npm run test
npm run build
```

From `backend/`, with the virtual environment active:

```bash
python -m pytest -q
alembic check
```

The JavaScript lockfile and Python lockfile capture the dependency versions used for verification. The Python lock includes test dependencies.

## Media and ownership

Public previews are capped at 90 seconds. Audio uploads are validated from their bytes with a decoder and capped at 20 MB. Full lyrics and original audio require ownership or a paid license. Media is stored outside static web assets and served through authorized endpoints. A purchased ZIP contains the lyric snapshot, license record, and original audio when supplied.

Do not put a writer's entire valuable work in their public preview: anything intentionally shared can be recorded or transcribed. A marketplace sells agreed rights and services, rather than an assurance that previews cannot be copied.

The current API stores files on a protected local volume. Keep it backed up alongside the database; move to private object storage and scoped download URLs before scaling across multiple API hosts.

## Before a real launch

Configure a payment provider and server-side adapter, approved license contracts, seller onboarding and payouts, account recovery/email verification, moderation, and a shared ingress or Redis rate limiter. Apply migrations once per release before starting replicas. Use PostgreSQL, HTTPS, explicit secrets and `DEMO_SEED=false`, `DEMO_PAYMENTS=false`, `COOKIE_SECURE=true`, and `ENVIRONMENT=production`.

The Compose setup is for development. For production, supply HTTPS origins, keep the API reachable only through the trusted proxy, replace wildcard proxy trust with the proxy's actual addresses, and set an upload body limit at ingress. Keep backups and monitor API errors and payment reconciliation.

## References

- [React documentation](https://react.dev/learn)
- [FastAPI authentication](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
- [SQLAlchemy session lifecycle](https://docs.sqlalchemy.org/en/20/orm/session_basics.html)

Third-party libraries and fonts retain their own licenses. The generated preview audio is synthesized by `scripts/generate_demo_audio.py` and contains no sampled recordings.
