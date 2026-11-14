# SyncSpace

A collaborative document workspace, built as a pnpm monorepo.

> **Status: Phase 2 — authentication.** Users can register, log in and log
> out, and the web app has a protected account page. Workspaces, the document
> editor, real-time sync and sharing are **not implemented yet**. See [docs/architecture.md](docs/architecture.md)
> for what exists today and what is planned.

## Tech stack

| Area       | Technology                                                 |
| ---------- | ---------------------------------------------------------- |
| Web        | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| API        | Node.js 24 LTS, Fastify 5                                  |
| Auth       | Argon2id password hashing, database-backed sessions in HttpOnly cookies |
| Database   | PostgreSQL 17, Prisma 7 (`@prisma/adapter-pg`)             |
| Validation | Zod 4                                                      |
| Tooling    | pnpm workspaces, TypeScript 6 (strict), ESLint, Vitest     |
| Infra      | Docker Compose (local PostgreSQL), GitHub Actions          |

## Repository layout

```
apps/
  web/            Next.js frontend
  api/            Fastify REST API
  collaboration/  Collaboration service (liveness endpoint only for now)
packages/
  database/       Prisma schema, migrations and database client
  shared/         Code shared across apps (env validation, API contracts, Zod schemas)
docs/             Architecture documentation
```

## Prerequisites

- Node.js 24 LTS (`.nvmrc` is provided: `nvm use`)
- pnpm 10 (`corepack enable` picks up the version pinned in `package.json`)
- Docker with Docker Compose

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. Create your local environment file
cp .env.example .env

# 3. Start PostgreSQL (waits until the container is healthy)
pnpm db:up

# 4. Apply database migrations
pnpm db:deploy

# 5. Start everything in watch mode
pnpm dev
```

| Service       | URL                                 |
| ------------- | ----------------------------------- |
| Web           | http://localhost:3000               |
| Register      | http://localhost:3000/register      |
| Log in        | http://localhost:3000/login         |
| Account (protected) | http://localhost:3000/account |
| API health    | http://localhost:4000/api/v1/health |
| Collaboration | http://localhost:4001/health        |

The home page shows the live result of the API health check, including
database connectivity.

```bash
curl http://localhost:4000/api/v1/health
# {"status":"ok","service":"api","timestamp":"...","uptimeSeconds":12,"checks":{"database":"up"}}
```

The endpoint responds `200` when the database is reachable and `503` with
`"status":"degraded"` when it is not.

## Authentication

| Method | Route                   | Description                                             |
| ------ | ----------------------- | ------------------------------------------------------- |
| POST   | `/api/v1/auth/register` | Create an account and start a session (`201`)           |
| POST   | `/api/v1/auth/login`    | Verify credentials and start a session (`200`)          |
| POST   | `/api/v1/auth/logout`   | Delete the current session and clear the cookie (`204`) |
| GET    | `/api/v1/auth/me`       | Profile of the signed-in user (`200`, or `401`)         |

The browser calls these routes on the web app's own origin
(`http://localhost:3000/api/v1/...`); the web app forwards them to the API.

```bash
# Register (-c stores the session cookie in a file)
curl -i -c cookies.txt -H 'content-type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"correct horse battery"}' \
  http://localhost:4000/api/v1/auth/register

# Who am I? (-b sends the cookie back)
curl -b cookies.txt http://localhost:4000/api/v1/auth/me
```

Every error response has the same shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Some fields are invalid.",
    "details": [{ "path": "email", "message": "Enter a valid email address." }]
  }
}
```

Security properties (details in [docs/architecture.md](docs/architecture.md#authentication)):

- Passwords are hashed with Argon2id; plain-text passwords are never stored or logged.
- The session token lives only in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` in
  production). Nothing is kept in `localStorage`. The database stores only a hash of the token.
- CSRF: `SameSite=Lax` plus an `Origin` check on every state-changing request.
- Login is rate limited per client IP (20 attempts / 15 min) and per account
  (10 failed attempts / 15 min); registration per IP (10 / hour).

## Scripts

Run from the repository root.

| Command            | Description                                                    |
| ------------------ | -------------------------------------------------------------- |
| `pnpm dev`         | Build the packages, then run all apps and packages in watch mode |
| `pnpm build`       | Production build of every package and app                      |
| `pnpm lint`        | ESLint across the workspace                                    |
| `pnpm typecheck`   | TypeScript type checking across the workspace                  |
| `pnpm test`        | Vitest across the workspace (requires PostgreSQL running)      |
| `pnpm db:up`       | Start PostgreSQL via Docker Compose                            |
| `pnpm db:down`     | Stop the Docker Compose stack (data volume is kept)            |
| `pnpm db:migrate`  | Create and apply a migration during development                |
| `pnpm db:deploy`   | Apply pending migrations (CI / production)                     |
| `pnpm db:status`   | Show migration status                                          |
| `pnpm db:generate` | Regenerate the Prisma client                                   |
| `pnpm db:studio`   | Open Prisma Studio                                             |

To run a single app: `pnpm --filter @syncspace/api dev`.
After `pnpm build`, each app can be started with `pnpm --filter <name> start`.

## Environment variables

All services read one `.env` file at the repository root. Each service
validates its variables with Zod at startup and exits with a list of problems
if any are missing or malformed.

| Variable                                                              | Used by        | Description                                  |
| --------------------------------------------------------------------- | -------------- | -------------------------------------------- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`  | Docker Compose | PostgreSQL container settings                |
| `DATABASE_URL`                                                        | API, Prisma    | PostgreSQL connection string (required)      |
| `API_HOST`, `API_PORT`                                                | API            | Listen address (default `0.0.0.0:4000`)      |
| `LOG_LEVEL`                                                           | API            | Pino log level (default `info`)              |
| `WEB_ORIGIN`                                                          | API            | Origin of the web app, used for the CSRF origin check (required) |
| `SESSION_TTL_DAYS`                                                    | API            | Session lifetime in days (default `7`)       |
| `TRUST_PROXY`                                                         | API            | Read the client IP from `X-Forwarded-For` (default `false`). Enable only when the API is reachable solely through a trusted proxy. |
| `COLLABORATION_HOST`, `COLLABORATION_PORT`                            | Collaboration  | Listen address (default `0.0.0.0:4001`)      |
| `API_URL`                                                             | Web (server)   | Base URL of the API; `/api/v1/*` is forwarded to it (required) |

The credentials in `.env.example` are for local development only.

## Database workflow

The Prisma schema lives in `packages/database/prisma/schema.prisma`.

1. Edit the schema.
2. Run `pnpm db:migrate` — Prisma creates a SQL migration in
   `packages/database/prisma/migrations`, applies it and regenerates the client.
3. Commit the migration.

Current tables: `users` and `sessions`. The first migration is an intentional
empty baseline that establishes the migration history.

## Testing

```bash
pnpm db:up   # the database integration tests need PostgreSQL
pnpm test
```

Integration tests never touch development data. Before they run, a separate
`<database>_test` database (for example `syncspace_test`) is created on the
same PostgreSQL server and migrated automatically.

- `apps/api` — auth and health route tests against the real app, real PostgreSQL
  and real Argon2 hashing (requests sent in-process with `fastify.inject`), plus
  env validation tests
- `apps/collaboration` — liveness endpoint tests against a real HTTP server
- `packages/database` — connection, unique-constraint and cascade tests
- `packages/shared` — schema and env validation helper tests

There are no automated browser tests yet.

## Adding UI components

shadcn/ui is configured in `apps/web/components.json`:

```bash
cd apps/web
pnpm dlx shadcn@latest add button
```
