# SyncSpace

A collaborative document workspace, built as a pnpm monorepo.

> **Status: Phase 1 — project foundation.** The repository contains the
> application skeleton, tooling and infrastructure. Product features
> (authentication, workspaces, the document editor, real-time sync, sharing)
> are **not implemented yet**. See [docs/architecture.md](docs/architecture.md)
> for what exists today and what is planned.

## Tech stack

| Area       | Technology                                                 |
| ---------- | ---------------------------------------------------------- |
| Web        | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| API        | Node.js 24 LTS, Fastify 5                                  |
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
  shared/         Code shared across apps (env validation, API contracts)
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
| `COLLABORATION_HOST`, `COLLABORATION_PORT`                            | Collaboration  | Listen address (default `0.0.0.0:4001`)      |
| `API_URL`                                                             | Web (server)   | Base URL of the API (required)               |

The credentials in `.env.example` are for local development only.

## Database workflow

The Prisma schema lives in `packages/database/prisma/schema.prisma`.

1. Edit the schema.
2. Run `pnpm db:migrate` — Prisma creates a SQL migration in
   `packages/database/prisma/migrations`, applies it and regenerates the client.
3. Commit the migration.

Phase 1 has no domain models. The initial migration is an intentional empty
baseline that establishes the migration history.

## Testing

```bash
pnpm db:up   # the database integration tests need PostgreSQL
pnpm test
```

- `apps/api` — health route tests (via `fastify.inject`, database probe injected) and env validation tests
- `apps/collaboration` — liveness endpoint tests against a real HTTP server
- `packages/database` — integration tests against the real PostgreSQL instance
- `packages/shared` — env validation helper tests

## Adding UI components

shadcn/ui is configured in `apps/web/components.json`:

```bash
cd apps/web
pnpm dlx shadcn@latest add button
```
