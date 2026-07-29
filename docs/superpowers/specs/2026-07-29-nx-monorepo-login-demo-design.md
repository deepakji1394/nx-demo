# Nx Monorepo — Next.js + FastAPI Login Demo — Design

Date: 2026-07-29

## Goal

A minimal Nx monorepo demonstrating a Next.js frontend and FastAPI backend with
JWT-based login and a personalized "Hello, {username}" page. No database — a
single in-memory demo user (`demo` / `demo123`).

## Tech Stack

- Monorepo: Nx (latest), pnpm package manager, integrated monorepo layout
- Frontend: Next.js (App Router, TypeScript) — `apps/web`, via `@nx/next`
- Backend: FastAPI — `apps/api`, via `@nxlv/python`, dependencies managed with `uv`
- Auth: JWT via `pyjwt`, passwords hashed with `passlib[bcrypt]`
- Styling: plain CSS (no UI library, no Tailwind)
- Containerization: one Dockerfile per app + root `docker-compose.yml`

Exact Nx / `@nx/next` / `@nxlv/python` versions will be pinned during
implementation to a mutually-compatible set and documented in the README,
along with any conflict resolution needed.

## Repo Layout

```
my-app/
├── apps/
│   ├── web/          # Next.js app
│   └── api/           # FastAPI app
├── docs/superpowers/specs/   # design docs (this file)
├── docker-compose.yml
├── nx.json
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

## Auth Flow (key design decision)

FastAPI is a pure, stateless JSON API — it never sets cookies. This keeps
`/auth/login` trivially testable with pytest and keeps the backend framework-
agnostic. Next.js owns all cookie handling:

1. **Login page** (`apps/web/app/login/page.tsx`, Client Component) submits
   `{username, password}` via `fetch('/api/py/auth/login', ...)`. This path is
   rewritten by Next.js (`next.config.js`) to `http://<api-host>:8000/auth/login`.
   FastAPI returns `{access_token}` on success or 401 on failure.
2. On success, the client POSTs the token to a Next.js Route Handler at
   `app/api/auth/session/route.ts`, which sets it as an `httpOnly`,
   `sameSite=lax` cookie on the Next.js response, then the client redirects
   to `/`.
3. On failure, the login page shows an inline error message and does **not**
   redirect.
4. **`/` (home) page** (`apps/web/app/page.tsx`) is a **Server Component**. It
   reads the cookie via `next/headers`, and if present calls FastAPI's `/me`
   directly, server-to-server, using an internal `API_URL` environment
   variable (`http://localhost:8000` locally, `http://api:8000` in Docker) —
   this bypasses the public rewrite, since rewrites apply to browser-originated
   requests hitting the Next server, not outgoing server-side `fetch` calls.
   - If the cookie is missing, or `/me` returns 401, the page redirects to
     `/login`.
   - Otherwise it renders `Hello, {username}` plus a `<LogoutButton />`
     Client Component.
5. **Logout**: the button POSTs to `app/api/auth/logout/route.ts`, which
   clears the cookie; the client then redirects to `/login`.

A code comment at the cookie-setting site notes the httpOnly-vs-localStorage
tradeoff (httpOnly chosen here: not readable by JS, mitigates XSS token
theft; localStorage would be simpler but exposes the token to any injected
script).

## Backend (`apps/api`)

- `main.py` — FastAPI app instance, CORS middleware allowing
  `http://localhost:3000`, and three routes:
  - `POST /auth/login` — validates against an in-memory dict:
    ```python
    # In-memory demo user store. A real implementation would replace this
    # with a database-backed user lookup (e.g. SQLAlchemy + Postgres).
    USERS = {"demo": {"username": "demo", "hashed_password": <bcrypt hash of "demo123">}}
    ```
    Returns `{access_token}` (JWT, `sub=username`, short expiry e.g. 30 min)
    on success, 401 on failure.
  - `GET /me` — requires `Authorization: Bearer <token>`, decodes/validates
    the JWT, returns `{username}` or 401.
  - `GET /health` — returns `{"status": "ok"}`.
- JWT signing secret read from an environment variable with a dev-only
  default fallback.
- Nx project targets (via `@nxlv/python`):
  - `serve` — `uvicorn main:app --reload --port 8000`
  - `lint` — ruff
  - `test` — pytest; one test covers `/auth/login` success and failure cases
- Dependencies declared in `apps/api/pyproject.toml`, installed via `uv`.

## Frontend (`apps/web`)

- `app/login/page.tsx` — Client Component form (username, password), calls
  the login flow described above, displays errors inline.
- `app/page.tsx` — Server Component protected page as described above.
- `app/api/auth/session/route.ts` — sets the httpOnly cookie.
- `app/api/auth/logout/route.ts` — clears the cookie.
- `next.config.js` — rewrite: `/api/py/:path*` → `${API_URL}/:path*`.
- `app/globals.css` — single global stylesheet, minimal clean styling.
- No component library, no Tailwind.

## Docker

- `apps/api/Dockerfile` — `python:3.12-slim`, installs `uv`, copies
  `pyproject.toml`/lockfile, `uv sync`, runs
  `uvicorn main:app --host 0.0.0.0 --port 8000`.
- `apps/web/Dockerfile` — multi-stage (deps → build → runner), Next.js
  `output: 'standalone'`, final stage runs the standalone server on port
  3000 with `API_URL=http://api:8000`.
- `docker-compose.yml` — `api` and `web` services; `web` depends on `api`;
  ports `3000:3000` and `8000:8000`; `web` reaches `api` via the compose
  service name (`http://api:8000`).

## Nx Requirements

- `nx serve web`, `nx serve api`, `nx run-many -t serve` all start both apps
  locally (outside Docker) using the same `API_URL` default
  (`http://localhost:8000`) so the frontend rewrite works without Docker.
- `nx affected -t lint test` runs both projects' lint/test targets.
- `@nx/next` and `@nxlv/python` plugins configured per each tool's Nx
  generator conventions; exact versions documented in README.

## Testing

- Backend: one pytest test file (`apps/api/test_main.py` or similar) covering
  successful and failed login via FastAPI's `TestClient`.
- Manual acceptance verification (per the acceptance criteria) covers the
  frontend end-to-end, since no frontend test framework was requested.

## Out of Scope

- Real database / persistence
- Refresh tokens, password reset, registration
- Multiple demo users
- CI pipeline configuration
