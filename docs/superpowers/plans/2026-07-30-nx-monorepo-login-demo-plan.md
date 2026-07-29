# Nx Monorepo Login Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Nx monorepo (pnpm) with a Next.js frontend and a FastAPI backend that together demonstrate JWT login against an in-memory demo user and a personalized "Hello, {username}" page, runnable both via `nx serve` and via `docker compose up`.

**Architecture:** FastAPI (`apps/api`) is a stateless JSON API — login validates against an in-memory bcrypt-hashed user dict and returns a JWT; `/me` validates the JWT from an `Authorization: Bearer` header. Next.js (`apps/web`, App Router) owns all cookie handling: the login page fetches a token from FastAPI through an Nx-configured rewrite, hands it to a same-origin Route Handler that sets it as an httpOnly cookie, and the protected `/` page is a Server Component that reads the cookie and calls FastAPI's `/me` directly server-to-server.

**Tech Stack:** Nx 23.1.0, pnpm, Next.js 16 (App Router, TypeScript, plain CSS) via `@nx/next` 23.1.0, FastAPI on Python 3.12 via `@nxlv/python` 23.0.0 and `uv`, `pyjwt` + `passlib[bcrypt]` for auth, Docker + docker-compose.

## Global Constraints

- Monorepo tool: Nx (latest = 23.1.0), pnpm as package manager — **verified compatible**: `@nx/next@23.1.0` and `@nxlv/python@23.0.0` both target `nx@23.1.0`/`@nx/devkit>=22.0.0`; no version conflict found, so these three versions are pinned throughout.
- Frontend: Next.js App Router, TypeScript, in `apps/web`, via `@nx/next`.
- Backend: FastAPI in `apps/api`, via `@nxlv/python`, dependencies managed with `uv`, Python 3.12 (matches the Docker base image).
- Auth: JWT via `pyjwt`, passwords hashed with `passlib[bcrypt]`.
- No database: single in-memory dict user store, with a comment marking where a real DB would go.
- CORS enabled for `http://localhost:3000` on the API.
- API runs with uvicorn on port 8000; web on port 3000.
- API calls from the browser are proxied via the Next.js rewrite `/api/py/* → http://<api-host>:8000/*`.
- Styling: plain CSS only, no UI library, no Tailwind.
- One Dockerfile per app + root `docker-compose.yml`; `apps/web/Dockerfile` is a multi-stage build producing Next's standalone output; `apps/api/Dockerfile` is `python:3.12-slim` installing via `uv`.
- Demo credentials: username `demo`, password `demo123`.
- This environment's default npm registry (Chegg CodeArtifact) returns 401 for public packages — a project-local `.npmrc` pinning `registry=https://registry.npmjs.org/` is required for installs to succeed. This is scoped to this demo repo only (all its dependencies are public OSS packages — Next.js, FastAPI, Nx, etc. — nothing proprietary).

---

### Task 1: Scaffold the Nx/pnpm workspace and root config

**Files:**
- Create (via generator, then moved into place): root `package.json`, `nx.json`, `pnpm-workspace.yaml`, `.gitignore`, `tsconfig.base.json`, `tsconfig.json`
- Create: `.npmrc`
- Modify: `package.json` (rename), `pnpm-workspace.yaml` (restrict glob), `.gitignore` (append Python/Docker ignores)
- Delete: generator-scaffolded AI-agent boilerplate (`.agents/`, `.claude/`, `.codex/`, `.cursor/`, `.gemini/`, `.opencode/`, `opencode.json`, `AGENTS.md`, `CLAUDE.md`, `packages/`) — not part of this repo's spec

**Interfaces:**
- Produces: a working `apps/` directory convention, pnpm workspace rooted at `apps/web` only (apps/api is added in Task 3 and is intentionally *not* a pnpm package), and `nx --version` / `nx graph` functioning from the repo root.

- [ ] **Step 1: Generate the base workspace into a scratch directory**

The repo directory (`/Users/dmalhotra/work/my-app`) already has `.git/` and `docs/` in it, so generate into an empty scratch directory first and merge the output in, rather than risking `create-nx-workspace` refusing a non-empty target.

```bash
SCRATCH=$(mktemp -d)
npx --registry=https://registry.npmjs.org create-nx-workspace@23.1.0 "$SCRATCH/init" \
  --preset=apps --packageManager=pnpm --nxCloud=skip --interactive=false
```

- [ ] **Step 2: Strip generator boilerplate that isn't part of this repo's spec, then merge into the real repo**

```bash
cd "$SCRATCH/init"
rm -rf .git .agents .claude .codex .cursor .gemini .opencode packages
rm -f opencode.json AGENTS.md CLAUDE.md
rsync -a ./ /Users/dmalhotra/work/my-app/
cd /Users/dmalhotra/work/my-app
find . -maxdepth 1 -not -path './.git' -not -path '.' -not -path './docs' | sort
```

Expected: listing shows `nx.json`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `.gitignore`, `README.md` (plus `docs/` and `.git/` untouched).

- [ ] **Step 3: Pin the public npm registry for this repo**

Create `/Users/dmalhotra/work/my-app/.npmrc`:

```
registry=https://registry.npmjs.org/
```

- [ ] **Step 4: Rename the workspace package and restrict the pnpm workspace glob**

Edit `package.json` — change `"name": "@org/source"` to `"name": "my-app"`.

Edit `pnpm-workspace.yaml` to:

```yaml
packages:
  - apps/web
```

(`apps/api` is a Python project with no `package.json`; leaving a broad `apps/*` glob risks pnpm choking on it.)

- [ ] **Step 5: Extend `.gitignore`**

Append to the existing `.gitignore`:

```

# Python (apps/api)
**/.venv/
**/__pycache__/
*.pyc

# Test/coverage output
/coverage/
/reports/
```

- [ ] **Step 6: Verify Nx is functional**

```bash
npx nx --version
```

Expected: prints `23.1.0` (or the installed Nx version) with no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Scaffold Nx/pnpm workspace"
```

---

### Task 2: Generate and configure the Next.js app (`apps/web`)

**Files:**
- Create (via generator): `apps/web/{next.config.js,next-env.d.ts,index.d.ts,tsconfig.json,package.json,.eslintrc.json,public/favicon.ico,src/app/{layout.tsx,global.css,page.tsx,page.module.css},src/app/api/hello/route.ts}`
- Modify: `apps/web/next.config.js` (full overwrite — rewrite + standalone output)
- Modify: `apps/web/src/app/layout.tsx` (full overwrite — minimal root layout)
- Delete: `apps/web/src/app/api/hello/route.ts`, `apps/web/src/app/page.module.css` (unused sample files)
- Modify: `nx.json` (rename the Next dev target to `serve`)

**Interfaces:**
- Produces: `nx run web:serve` starts `next dev` on port 3000; `/api/py/*` requests from the browser are rewritten to `${API_URL ?? 'http://localhost:8000'}/*`.

- [ ] **Step 1: Add the `@nx/next` plugin**

```bash
npm_config_registry=https://registry.npmjs.org pnpm add -D @nx/next@23.1.0
```

- [ ] **Step 2: Generate the app**

```bash
npx nx g @nx/next:application --directory=apps/web --appDir=true --style=css \
  --e2eTestRunner=none --unitTestRunner=none --linter=eslint --no-interactive
```

- [ ] **Step 3: Finish the pnpm install (the generator's own install step can 401 mid-run against the wrong registry)**

```bash
npm_config_registry=https://registry.npmjs.org pnpm install
```

Expected: completes with `next`, `react`, `react-dom`, `@types/react`, `@types/react-dom` added, no `ERR_PNPM_FETCH_401`.

- [ ] **Step 4: Remove the generator's sample route and unused CSS module**

```bash
rm -f apps/web/src/app/api/hello/route.ts apps/web/src/app/page.module.css
```

(This `rm -f` targets two specific generated sample files, not a directory.)

- [ ] **Step 5: Overwrite `apps/web/next.config.js`**

```js
//@ts-check

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/py/:path*',
        destination: `${process.env.API_URL ?? 'http://localhost:8000'}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

- [ ] **Step 6: Overwrite `apps/web/src/app/layout.tsx`**

```tsx
import './global.css';

export const metadata = {
  title: 'Login Demo',
  description: 'Nx monorepo login demo',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 7: Rename the Next dev target to `serve`**

In `nx.json`, find the `@nx/next/plugin` entry and change `"devTargetName": "dev"` to `"devTargetName": "serve"`.

- [ ] **Step 8: Verify `nx run web:serve` boots and the rewrite is wired (no backend yet, so expect a proxy/connection error, not a 404 from Next itself)**

```bash
(npx nx run web:serve > /tmp/web-serve.log 2>&1 &)
sleep 6
curl -s -o /dev/null -w "root: %{http_code}\n" http://localhost:3000/
pkill -f "next dev"
```

Expected: `root: 200` (the still-default sample homepage — it'll be replaced in Task 5). Note: if port 3000 is already occupied by an unrelated process on this machine, Next will pick the next free port and print it in `/tmp/web-serve.log` — use that port for the curl check instead.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Generate and configure the Next.js web app"
```

---

### Task 3: Generate and configure the FastAPI project (`apps/api`)

**Files:**
- Create (via generator): `apps/api/{project.json,pyproject.toml,README.md,.python-version,tests/{__init__.py,conftest.py,test_hello.py},src/api/{__init__.py,hello.py}}`
- Modify: `apps/api/project.json` (fix `sourceRoot`, fix `lint`/`format` file patterns, add `serve` target)
- Delete: `apps/api/src/api/hello.py`, `apps/api/tests/test_hello.py` (sample files, replaced by real code/tests in Task 4)

**Interfaces:**
- Produces: `nx run api:serve` runs `uvicorn api.main:app` on port 8000 (module wired up in Task 4); `nx run api:test` runs pytest; `nx run api:lint` runs ruff.

- [ ] **Step 1: Add the `@nxlv/python` plugin**

```bash
npm_config_registry=https://registry.npmjs.org pnpm add -Dw @nxlv/python@23.0.0
```

- [ ] **Step 2: Generate the uv-managed project (pinned to Python 3.12 to match the Docker base image)**

```bash
npx nx g @nxlv/python:uv-project api --directory=apps/api --projectType=application \
  --moduleName=api --srcDir=true \
  --pyenvPythonVersion=3.12 --pyprojectPythonDependency=">=3.12,<4" \
  --no-interactive
```

Expected output includes `CREATE apps/api/src/api/__init__.py` (not `apps/api/apps/api/...` — passing `name`, `--directory`, and `--moduleName` separately avoids a generator bug where passing a slash-containing name directly produces an invalid `from apps/api.hello import hello` in the sample test).

- [ ] **Step 3: Remove the sample files**

```bash
rm -f apps/api/src/api/hello.py apps/api/tests/test_hello.py
```

- [ ] **Step 4: Fix `apps/api/project.json`**

Change `"sourceRoot": "apps/api/api"` to `"sourceRoot": "apps/api/src/api"`.

Change the `lint` target's `"lintFilePatterns": []` to `"lintFilePatterns": ["src", "tests"]`.

Change the `format` target's `"filePatterns": []` to `"filePatterns": ["src", "tests"]`.

Add a `serve` target (after the existing `install` target):

```json
    "serve": {
      "executor": "@nxlv/python:run-commands",
      "options": {
        "command": "uv run uvicorn api.main:app --reload --host 0.0.0.0 --port 8000",
        "cwd": "{projectRoot}"
      }
    }
```

- [ ] **Step 5: Add runtime dependencies**

```bash
npx nx run api:add --name=fastapi
npx nx run api:add --name=uvicorn
npx nx run api:add --name=pyjwt
npx nx run api:add --name=passlib
npx nx run api:add --name=bcrypt
npx nx run api:add --name=httpx
```

(`httpx` is required by FastAPI's `TestClient`, used in Task 4's tests.)

- [ ] **Step 6: Add a placeholder `main.py` so `serve` has something to boot, and verify the full pipeline**

Create `apps/api/src/api/main.py`:

```python
from fastapi import FastAPI

app = FastAPI()


@app.get("/health")
def health():
    return {"status": "ok"}
```

```bash
(npx nx run api:serve > /tmp/api-serve.log 2>&1 &)
sleep 6
curl -s http://localhost:8000/health
pkill -f "uvicorn api.main:app"
```

Expected: `{"status":"ok"}`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Generate and configure the FastAPI project"
```

---

### Task 4: Implement backend auth (login, /me, in-memory user)

**Files:**
- Create: `apps/api/src/api/users.py`
- Create: `apps/api/src/api/auth.py`
- Modify: `apps/api/src/api/main.py` (full rewrite — CORS + all three endpoints)
- Create: `apps/api/tests/test_auth.py`

**Interfaces:**
- Consumes: nothing from earlier tasks beyond the working `nx run api:test`/`nx run api:serve` pipeline from Task 3.
- Produces: `create_access_token(username: str) -> str`, `decode_access_token(token: str) -> str` (raises `HTTPException(401)` on failure), `get_current_username(...) -> str` (FastAPI dependency), `get_user(username: str) -> dict | None`, `verify_password(plain_password: str, hashed_password: str) -> bool`. `POST /auth/login` returns `{"access_token": str}` (200) or 401. `GET /me` returns `{"username": str}` (200) or 401. `GET /health` returns `{"status": "ok"}`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_auth.py`:

```python
from fastapi.testclient import TestClient

from api.main import app

client = TestClient(app)


def test_login_success_returns_access_token():
    response = client.post(
        "/auth/login", json={"username": "demo", "password": "demo123"}
    )
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_login_wrong_password_returns_401():
    response = client.post(
        "/auth/login", json={"username": "demo", "password": "wrong"}
    )
    assert response.status_code == 401


def test_login_unknown_user_returns_401():
    response = client.post(
        "/auth/login", json={"username": "nobody", "password": "demo123"}
    )
    assert response.status_code == 401


def test_me_requires_valid_token():
    response = client.get("/me")
    assert response.status_code in (401, 403)


def test_me_returns_username_for_valid_token():
    login = client.post(
        "/auth/login", json={"username": "demo", "password": "demo123"}
    )
    token = login.json()["access_token"]
    response = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200
    assert response.json() == {"username": "demo"}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx nx run api:test
```

Expected: FAIL — `ModuleNotFoundError` or `ImportError` (`api.main` has no `/auth/login` or `/me` routes yet).

- [ ] **Step 3: Implement the in-memory user store**

Create `apps/api/src/api/users.py`:

```python
"""In-memory user store for this demo.

A real implementation would replace USERS and get_user() with a
database-backed lookup (e.g. SQLAlchemy + Postgres) behind the same
get_user(username) -> dict | None interface.
"""

from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

USERS = {
    "demo": {
        "username": "demo",
        "hashed_password": pwd_context.hash("demo123"),
    }
}


def get_user(username: str) -> dict | None:
    return USERS.get(username)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)
```

- [ ] **Step 4: Implement JWT creation/verification**

Create `apps/api/src/api/auth.py`:

```python
"""JWT creation and verification for the demo login flow."""

import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

bearer_scheme = HTTPBearer()


def create_access_token(username: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    payload = {"sub": username, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    username = payload.get("sub")
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )
    return username


def get_current_username(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    return decode_access_token(credentials.credentials)
```

- [ ] **Step 5: Wire up the FastAPI app**

Overwrite `apps/api/src/api/main.py`:

```python
from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from api.auth import create_access_token, get_current_username
from api.users import get_user, verify_password

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str


class MeResponse(BaseModel):
    username: str


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest):
    user = get_user(payload.username)
    if user is None or not verify_password(payload.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token(user["username"])
    return LoginResponse(access_token=token)


@app.get("/me", response_model=MeResponse)
def me(username: str = Depends(get_current_username)):
    return MeResponse(username=username)
```

- [ ] **Step 6: Run the tests to verify they pass**

```bash
npx nx run api:test
```

Expected: PASS — all 5 tests green.

- [ ] **Step 7: Run lint**

```bash
npx nx run api:lint
```

Expected: no errors (fix any ruff findings before proceeding).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Implement JWT login, /me, and the in-memory demo user"
```

---

### Task 5: Implement frontend auth pages, cookie handling, and styling

**Files:**
- Create: `apps/web/src/app/login/page.tsx`
- Create: `apps/web/src/app/api/auth/session/route.ts`
- Create: `apps/web/src/app/api/auth/logout/route.ts`
- Create: `apps/web/src/app/components/LogoutButton.tsx`
- Modify: `apps/web/src/app/page.tsx` (full rewrite — protected Server Component)
- Modify: `apps/web/src/app/global.css` (full rewrite — minimal styling)

**Interfaces:**
- Consumes: `/api/py/auth/login` (rewritten to FastAPI `POST /auth/login`, Task 4), server-side `${API_URL}/me` (Task 4).
- Produces: `/login` and `/` pages and a working cookie-based session, consumed only by the browser (no other task depends on these types).

- [ ] **Step 1: Login page**

Create `apps/web/src/app/login/page.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    const loginRes = await fetch('/api/py/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    if (!loginRes.ok) {
      setError('Invalid username or password');
      return;
    }

    const { access_token: accessToken } = await loginRes.json();

    // The token is handed to a same-origin route so it can be stored as an
    // httpOnly cookie (unreadable by JS, mitigating XSS token theft).
    // localStorage would be simpler to wire up but exposes the token to any
    // injected script.
    await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: accessToken }),
    });

    router.push('/');
    router.refresh();
  }

  return (
    <main className="page-center">
      <form onSubmit={handleSubmit} className="card">
        <h1>Log in</h1>
        {error && <p className="error">{error}</p>}
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <button type="submit">Log in</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Session and logout Route Handlers**

Create `apps/web/src/app/api/auth/session/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { token } = await request.json();

  if (!token) {
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set('token', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 30,
  });
  return response;
}
```

Create `apps/web/src/app/api/auth/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete('token');
  return response;
}
```

- [ ] **Step 3: Logout button**

Create `apps/web/src/app/components/LogoutButton.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <button onClick={handleLogout} className="logout-button">
      Logout
    </button>
  );
}
```

- [ ] **Step 4: Protected home page**

Overwrite `apps/web/src/app/page.tsx`:

```tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import LogoutButton from './components/LogoutButton';

const API_URL = process.env.API_URL ?? 'http://localhost:8000';

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('token')?.value;

  if (!token) {
    redirect('/login');
  }

  const meRes = await fetch(`${API_URL}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });

  if (!meRes.ok) {
    redirect('/login');
  }

  const { username } = await meRes.json();

  return (
    <main className="page-center">
      <div className="card">
        <h1>Hello, {username}</h1>
        <LogoutButton />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Styling**

Overwrite `apps/web/src/app/global.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, sans-serif;
  background: #f5f5f7;
  color: #1a1a1a;
}

.page-center {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.card {
  background: white;
  padding: 2.5rem;
  border-radius: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
  min-width: 320px;
  text-align: center;
}

.card form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  text-align: left;
}

.card label {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.9rem;
}

.card input {
  padding: 0.5rem 0.6rem;
  border: 1px solid #d0d0d5;
  border-radius: 6px;
  font-size: 1rem;
}

.card button,
.logout-button {
  padding: 0.6rem 1rem;
  border: none;
  border-radius: 6px;
  background: #1a1a1a;
  color: white;
  font-size: 1rem;
  cursor: pointer;
}

.logout-button {
  margin-top: 1.5rem;
}

.error {
  color: #c0392b;
  font-size: 0.9rem;
  margin: 0;
}
```

- [ ] **Step 6: Manual verification of the full flow**

Run both apps and exercise the flow end to end:

```bash
(npx nx run api:serve > /tmp/api-serve.log 2>&1 &)
(npx nx run web:serve > /tmp/web-serve.log 2>&1 &)
sleep 8

curl -s -o /dev/null -w "GET / (no cookie) -> %{http_code}\n" http://localhost:3000/

TOKEN=$(curl -s -X POST http://localhost:3000/api/py/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')

curl -s -c /tmp/cookies.txt -X POST http://localhost:3000/api/auth/session \
  -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}"

curl -s -b /tmp/cookies.txt http://localhost:3000/ | grep -o "Hello, [a-zA-Z]*"

curl -s -o /dev/null -w "wrong password -> %{http_code}\n" -X POST http://localhost:3000/api/py/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"demo","password":"bad"}'

pkill -f "next dev"
pkill -f "uvicorn api.main:app"
```

Expected: first curl redirects (`307`/`308`) to `/login` since there's no cookie yet; after posting the session cookie, `GET /` contains `Hello, demo`; the wrong-password login returns `401`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Implement login page, cookie session handling, and protected home page"
```

---

### Task 6: Dockerize both apps and wire up docker-compose

**Files:**
- Create: `apps/web/Dockerfile`
- Create: `.dockerignore` (root, applies to the web build's root context)
- Create: `apps/api/Dockerfile`
- Create: `apps/api/.dockerignore`
- Create: `docker-compose.yml`

**Interfaces:**
- Produces: `docker compose up --build` serving web on `http://localhost:3000` and api on `http://localhost:8000`, with web reaching api via `http://api:8000`.

- [ ] **Step 1: Generate the uv lockfile (needed for a reproducible Docker install)**

```bash
npx nx run api:lock
```

Expected: creates/updates `apps/api/uv.lock`.

- [ ] **Step 2: Root `.dockerignore`**

Create `/Users/dmalhotra/work/my-app/.dockerignore`:

```
node_modules
apps/api
.git
.nx
docs
coverage
reports
dist
**/.next
```

- [ ] **Step 3: `apps/web/Dockerfile`**

```dockerfile
# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

# ---- build ----
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN pnpm exec nx build web

# ---- runner ----
FROM node:22-slim AS runner
WORKDIR /repo
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

- [ ] **Step 4: `apps/api/.dockerignore`**

Create `apps/api/.dockerignore`:

```
.venv
__pycache__
dist
tests
README.md
*.pyc
```

- [ ] **Step 5: `apps/api/Dockerfile`**

```dockerfile
FROM python:3.12-slim

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY src ./src

RUN uv sync --frozen --no-dev

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 6: `docker-compose.yml`**

Create `/Users/dmalhotra/work/my-app/docker-compose.yml`:

```yaml
services:
  api:
    build:
      context: ./apps/api
      dockerfile: Dockerfile
    ports:
      - '8000:8000'
    environment:
      JWT_SECRET_KEY: dev-secret-key-change-in-production

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    ports:
      - '3000:3000'
    environment:
      API_URL: http://api:8000
    depends_on:
      - api
```

- [ ] **Step 7: Verify the full Docker Compose acceptance flow**

```bash
docker compose up --build -d
sleep 15
curl -s -o /dev/null -w "root: %{http_code}\n" http://localhost:3000/
docker compose exec -T api curl -s http://localhost:8000/health || true
TOKEN=$(curl -s -X POST http://localhost:3000/api/py/auth/login \
  -H 'Content-Type: application/json' -d '{"username":"demo","password":"demo123"}' \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["access_token"])')
curl -s -c /tmp/docker-cookies.txt -X POST http://localhost:3000/api/auth/session \
  -H 'Content-Type: application/json' -d "{\"token\":\"$TOKEN\"}"
curl -s -b /tmp/docker-cookies.txt http://localhost:3000/ | grep -o "Hello, [a-zA-Z]*"
docker compose down
```

Expected: `root: 200` or a redirect status before login; `Hello, demo` present after the session cookie is set.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Add Dockerfiles and docker-compose for web and api"
```

---

### Task 7: README and final acceptance pass

**Files:**
- Modify: `README.md` (full rewrite)

**Interfaces:**
- Produces: nothing consumed by other tasks — this is the terminal documentation + verification task.

- [ ] **Step 1: Write the README**

Overwrite `/Users/dmalhotra/work/my-app/README.md`:

```markdown
# Nx Monorepo — Next.js + FastAPI Login Demo

A minimal Nx monorepo demonstrating JWT login and a personalized
"Hello, {username}" page. No database — a single in-memory demo user.

**Demo credentials:** `demo` / `demo123`

## Stack and pinned versions

- Nx `23.1.0`, pnpm, package manager
- `@nx/next` `23.1.0` — Next.js (App Router, TypeScript) in `apps/web`
- `@nxlv/python` `23.0.0` — FastAPI in `apps/api`, managed with `uv`, Python 3.12
- Auth: `pyjwt` + `passlib[bcrypt]`

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
configured through the `API_URL` environment variable.

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
```

- [ ] **Step 2: Final full acceptance pass**

Run through every item in the original acceptance criteria and confirm each one, noting results:

```bash
# 1 & 5: Nx local mode
npx nx run-many -t serve &
sleep 8
curl -sI http://localhost:3000/ | head -1   # expect redirect to /login
kill %1

# 3: affected lint/test
npx nx affected -t lint test --base=HEAD~1

# Docker mode (criteria 1-4)
docker compose up --build -d
sleep 15
curl -sI http://localhost:3000/ | head -1
# ... repeat the login/hello/logout checks from Task 6 Step 7 ...
docker compose down
```

Fix anything that doesn't match the acceptance criteria before proceeding.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "Add README with setup, run modes, and pinned versions"
```
