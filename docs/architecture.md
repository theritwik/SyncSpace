# SyncSpace architecture

This document separates what **exists today** from what is **planned**.
Anything under "Planned" is a direction, not an implementation.

## Current architecture (Phase 1 — foundation)

```
                 ┌──────────────────────┐
  Browser ─────▶ │  web (Next.js)       │  :3000
                 │  server components   │
                 └──────────┬───────────┘
                            │ HTTP (server-side fetch, API_URL)
                            ▼
                 ┌──────────────────────┐
                 │  api (Fastify)       │  :4000
                 │  GET /api/v1/health  │
                 └──────────┬───────────┘
                            │ Prisma + node-postgres adapter (DATABASE_URL)
                            ▼
                 ┌──────────────────────┐
                 │  PostgreSQL 17       │  :5432 (Docker Compose)
                 └──────────────────────┘

                 ┌──────────────────────┐
                 │  collaboration       │  :4001
                 │  GET /health only    │  (not yet connected to anything)
                 └──────────────────────┘
```

### Workspace packages

| Package                    | Responsibility                                                                 |
| -------------------------- | ------------------------------------------------------------------------------ |
| `@syncspace/web`           | Next.js App Router frontend. Renders a landing page with live system status.   |
| `@syncspace/api`           | Fastify REST API. Exposes `GET /api/v1/health`.                                |
| `@syncspace/collaboration` | Standalone Node.js HTTP service with a liveness endpoint. No document sync.    |
| `@syncspace/database`      | Prisma schema, migrations, generated client and connection helpers.            |
| `@syncspace/shared`        | Env validation helper (`parseEnv`) and the health response contract (Zod).     |

Dependency direction: `apps → packages`. Packages never import from apps, and
`shared` has no dependency on `database`.

### Request flow: system status

1. The browser requests `/`. Next.js serves a prerendered static shell.
2. The `SystemStatus` server component (inside `<Suspense>`) calls
   `GET {API_URL}/api/v1/health` from the Next.js server with a 3 s timeout
   and streams the result into the page.
3. The API runs `SELECT 1` through Prisma (2 s timeout) and responds
   `200 {status: "ok"}` or `503 {status: "degraded"}`.
4. The web app validates the response with the same Zod schema the API is
   typed against (`apiHealthResponseSchema` in `@syncspace/shared`).

Because the browser never calls the API directly yet, the API has no CORS
configuration. That is added when client-side requests are introduced.

### Code organisation

Apps are organised by feature rather than by technical layer:

```
apps/api/src/
  main.ts                       process entry: env, database, listen, shutdown
  app.ts                        buildApp(): Fastify instance factory (used by tests)
  config/env.ts                 Zod env schema
  features/health/              health.routes.ts + tests

apps/web/src/
  app/                          routes and layout
  components/ui/                shadcn/ui components
  config/env.ts                 server-only env validation
  features/system-status/       health fetch + status component
```

`buildApp()` receives its dependencies (currently a database probe) as
arguments, so routes can be tested with `fastify.inject` without opening a
port or a database connection.

### Configuration

- One `.env` file at the repository root. The Node services load it with
  Node's built-in `--env-file-if-exists`; the Prisma CLI, Vitest and Next.js
  load it through `process.loadEnvFile`. No dotenv dependency.
- Every service validates its environment with Zod and fails fast with a
  readable list of problems.
- Real environment variables always take precedence over the file, which is
  how CI and production are configured.

### Database

- Prisma 7 with the `prisma-client` generator and the `@prisma/adapter-pg`
  driver adapter. Connection settings for the CLI live in
  `packages/database/prisma.config.ts`.
- The generated client is written to `packages/database/src/generated`
  (git-ignored) and compiled into the package's `dist`.
- There are no domain tables yet. The initial migration is an empty baseline;
  applying it creates Prisma's `_prisma_migrations` history table.

### Build and tooling

- Packages compile with `tsc` to `dist` and are consumed through their
  `exports` map. `pnpm dev` builds them once and then runs `tsc --watch`
  alongside the apps.
- TypeScript strict mode everywhere, plus `noUncheckedIndexedAccess`.
- ESLint flat config: a root config for services and packages, and
  `eslint-config-next` for the web app.
- Vitest per package. CI (`.github/workflows/ci.yml`) runs migrations, lint,
  typecheck, tests and build against a PostgreSQL service container.

### Version notes

- **Node.js 24 LTS**: supported by every dependency and in LTS until 2028.
- **Prisma 7.10** rather than npm's `latest` tag, which currently points to an
  8.0 release candidate.
- **TypeScript 6.0** rather than 7.0, because `typescript-eslint` does not yet
  support 7.
- **ESLint 10** for services and packages. The web app stays on ESLint 9, as
  scaffolded by `create-next-app`, because plugins bundled in
  `eslint-config-next` do not yet declare ESLint 10 support.

## Planned architecture

The following is intended direction for later phases. None of it is built.

```
  Browser ──HTTP──▶ web ──HTTP──▶ api ──▶ PostgreSQL
     │                             ▲
     └──WebSocket──▶ collaboration ┘ (auth check, document persistence)
```

| Area              | Intent                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Authentication    | User accounts and sessions owned by the API.                                                   |
| Workspaces        | Workspaces, membership and roles; authorisation enforced in the API.                           |
| Documents         | Document metadata and content stored in PostgreSQL through `@syncspace/database`.              |
| Real-time editing | The collaboration service accepts WebSocket connections and synchronises document state between clients. The sync approach (e.g. CRDT-based) is still to be decided. |
| Sharing           | Document-level access and share links.                                                         |
| Deployment        | Container images per app and a deployment pipeline.                                            |

Open decisions to be made in the phases that need them: authentication
mechanism, sync protocol and persistence format, and how the collaboration
service authorises connections.
