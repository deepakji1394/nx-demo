# Nx Monorepo — Next.js + FastAPI Login Demo

A minimal Nx monorepo demonstrating JWT login and a personalized
"Hello, {username}" page. No database — a single in-memory demo user.

**Demo credentials:** `demo` / `demo123`

## Stack and pinned versions

- Nx `23.1.0`, pnpm, package manager
- `@nx/next` `23.1.0` — Next.js (App Router, TypeScript) in `apps/web`
- `@nxlv/python` `23.0.0` — FastAPI in `apps/api`, managed with `uv`, Python 3.12
- Auth: `pyjwt` + `passlib[bcrypt]`
- `bcrypt` is pinned to `<4.1` in `apps/api/pyproject.toml` — newer bcrypt
  releases changed their version-reporting API in a way that breaks
  `passlib`'s bcrypt backend detection

These three versions were verified compatible during implementation
(`@nxlv/python@23.0.0`'s peer dependency is `@nx/devkit>=22.0.0`, satisfied
by `nx@23.1.0`) — no version conflicts were found or needed resolving.

## Prerequisites

- Node.js 22+, pnpm, [uv](https://docs.astral.sh/uv/), Python 3.12 (uv will
  install it automatically if it's not already on your machine)
- Docker + Docker Compose, if using the Docker run mode

This repo pins the public npm registry via a project-local `.npmrc`
(`registry=https://registry.npmjs.org/`), so installs work regardless of
any other registry configured on your machine.

## Setup

```bash
pnpm install
npx nx run api:sync   # creates apps/api/.venv and installs Python deps via uv
```

## Run mode 1: Nx, locally (no Docker)

```bash
npx nx run-many -t serve
```

- Web: http://localhost:3000
- API: http://localhost:8000

Or run them individually: `npx nx serve web` / `npx nx serve api`.

Visiting http://localhost:3000 redirects to `/login`. Log in with
`demo` / `demo123` to see "Hello, demo". Use the Logout button to clear
the session and return to `/login`.

## Run mode 2: Docker Compose

```bash
docker compose up --build
```

- Web: http://localhost:3000
- API: http://localhost:8000

Web reaches the API via the compose service name (`http://api:8000`),
configured through the `API_URL` environment variable. Next.js resolves
`next.config.js`'s `rewrites()` destination at build time (not just at
runtime) for its standalone output, so `API_URL` is passed both as a
build arg (`web.build.args` in `docker-compose.yml`, forwarded to the
Dockerfile's `ARG API_URL`) and as a runtime environment variable —
both must stay in sync.

## Other Nx commands

```bash
npx nx affected -t lint test   # lint + test whatever changed
npx nx run api:test            # backend pytest suite
npx nx run api:lint            # backend ruff lint
```

## Notes

- The API is a stateless JSON API; it never sets cookies. The Next.js app
  sets the JWT as an `httpOnly` cookie via a Route Handler after fetching
  it from the API — this keeps the token unreadable by JavaScript
  (mitigating XSS token theft), at the cost of a slightly more involved
  login flow than storing it in `localStorage`.
- The user store in `apps/api/src/api/users.py` is an in-memory dict; a
  real deployment would replace it with a database-backed lookup behind
  the same `get_user()` interface.
