# TaskManager agent guide

## Product

Elite Task is a corporate task manager. The first release is a local MVP with an Expo React Native client and a FastAPI server.

## Repository layout

- `apps/api` contains the FastAPI application, database models, API routes, tests, and local seed data.
- `apps/mobile` contains the Expo React Native application.
- `docs/IMPLEMENTATION_PLAN.md` is the authoritative delivery plan and acceptance checklist.

## Required workflow

1. Read `docs/IMPLEMENTATION_PLAN.md` before changing product behavior.
2. Preserve role-based access rules and project-level visibility.
3. Keep API responses typed and backward-compatible.
4. Add or update focused tests for backend behavior.
5. Run backend tests and TypeScript checks before handing work back.
6. Do not add production infrastructure or deploy unless the user explicitly requests it.

## Local commands

### API

```powershell
cd apps/api
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Tests:

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest
```

### Mobile

```powershell
cd apps/mobile
npm install
Copy-Item .env.example .env
npm run start:lts
```

Type check:

```powershell
cd apps/mobile
npm run typecheck
```

## Style

- Python: Python 3.12+, async FastAPI endpoints, SQLAlchemy 2 style, explicit schemas.
- TypeScript: strict mode, functional React components, no implicit `any`.
- Product copy is Russian by default; identifiers and code are English.

