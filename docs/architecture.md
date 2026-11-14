# SyncSpace architecture

This document separates what **exists today** from what is **planned**.
Anything under "Planned" is a direction, not an implementation.

## Current architecture (Phase 2 — authentication)

```
                 ┌──────────────────────┐
  Browser ─────▶ │  web (Next.js)       │  :3000
                 │  pages + proxy.ts    │
                 └──────────┬───────────┘
                            │ HTTP: /api/v1/* forwarded by proxy.ts,
                            │ plus server-side fetches (API_URL)
                            ▼
                 ┌──────────────────────┐
                 │  api (Fastify)       │  :4000
                 │  /api/v1/health      │
                 │  /api/v1/auth/*      │
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
| `@syncspace/web`           | Next.js App Router frontend: landing page, login, registration, protected account page. |
| `@syncspace/api`           | Fastify REST API: health check and authentication.                             |
| `@syncspace/collaboration` | Standalone Node.js HTTP service with a liveness endpoint. No document sync.    |
| `@syncspace/database`      | Prisma schema (`User`, `Session`), migrations, generated client, test-database helper. |
| `@syncspace/shared`        | Env validation helper and the API contracts (Zod): auth requests/responses, error shape, health. |

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

## Authentication

### How the pieces talk

The browser only ever talks to the web app's origin. `apps/web/src/proxy.ts`
forwards `/api/v1/*` to the API at request time. Consequences:

- The session cookie is a first-party cookie of the web origin, so
  `SameSite=Lax` works without cross-site cookie configuration.
- The API needs no CORS configuration.
- The API never has to be exposed to the internet directly.

```
Register / log in
  Browser ── POST /api/v1/auth/login ──▶ web (proxy.ts) ──▶ api
     ◀──────── Set-Cookie: syncspace_session=<token>; HttpOnly ─────┘

Open a protected page (/account)
  Browser ── GET /account + cookie ──▶ web
     proxy.ts: no cookie at all? → redirect to /login (fast path only)
     page:     getCurrentUser() ── GET /api/v1/auth/me + cookie ──▶ api ──▶ sessions table
               401 → redirect to /login        200 → render the page
```

### Sessions

Sessions are opaque and stored in PostgreSQL:

1. On login the API generates 32 random bytes (the token) and sends it to the
   browser in a cookie.
2. The `sessions` table stores the **SHA-256 hash** of the token, the user id
   and an expiry time. A database leak therefore does not reveal usable tokens.
3. On each authenticated request the API hashes the cookie value and looks it
   up. Logout deletes the row, which invalidates the session immediately.

This was chosen over stateless tokens (JWT) because sessions can be revoked
instantly and the cookie carries no data. The cost is one indexed database
lookup per authenticated request. Sessions have a fixed lifetime
(`SESSION_TTL_DAYS`); expired rows are deleted when encountered and at the
user's next login.

Cookie attributes: `HttpOnly` (not readable by JavaScript), `SameSite=Lax`,
`Path=/`, and `Secure` when `NODE_ENV=production`. The cookie is not signed:
the token is 256 bits of randomness and is validated against the database, so
a signature would add a secret to manage without adding security.

### Passwords

Hashed with Argon2id (`argon2` package, library defaults: 64 MiB, 3
iterations, parallelism 4). Passwords must be 10 to 128 characters. Login
runs a hash verification even for unknown emails and returns the same
`401 INVALID_CREDENTIALS` in both cases, so neither the message nor the
response time reveals whether an email is registered.

### CSRF

Two layers: the cookie's `SameSite=Lax` attribute, and an `onRequest` hook
(`apps/api/src/http/origin-check.ts`) that rejects any non-GET request whose
`Origin` header is not `WEB_ORIGIN` (or, without an `Origin`, whose
`Sec-Fetch-Site` is `cross-site`). No CSRF token is needed with this design.

### Rate limiting

`@fastify/rate-limit`, applied to the auth routes only:

| Limit                          | Default            | Purpose                                         |
| ------------------------------ | ------------------ | ----------------------------------------------- |
| Login attempts per client IP   | 20 per 15 minutes  | One client trying many accounts                 |
| Failed logins per email        | 10 per 15 minutes  | Many clients guessing one account's password    |
| Registrations per client IP    | 10 per hour        | Mass account creation                           |

### Errors and validation

Request bodies are validated with the Zod schemas in `@syncspace/shared`; the
web forms validate with the same schemas for immediate feedback. All errors
are returned as `{ error: { code, message, details? } }` by one error handler
(`apps/api/src/http/errors.ts`). Unexpected errors are logged server-side and
answered with a generic `500`.

### Known limitations

- **No email verification or password reset.** There is no email
  infrastructure yet, so an account can be created with any address.
- **Registration reveals whether an email is taken** (`409 EMAIL_TAKEN`).
  Avoiding that requires an email-based sign-up flow.
- **Rate-limit counters are in memory**, per API process. Running several API
  instances needs a shared store (for example Redis).
- **Per-IP limits depend on `X-Forwarded-For`.** The web app passes a
  client-supplied `X-Forwarded-For` through unchanged, so in production the
  edge proxy in front of the web app must overwrite that header. The
  per-account limit does not depend on the IP.
- **The per-account limit can lock a user out for the window** if someone
  else keeps submitting wrong passwords for their email.
- **Sessions do not slide**: a session ends `SESSION_TTL_DAYS` after login
  even if the user is active. There is no "log out everywhere" yet.

### Code organisation

Apps are organised by feature rather than by technical layer:

```
apps/api/src/
  main.ts                       process entry: env, database, listen, shutdown
  app.ts                        buildApp(): Fastify instance factory (used by tests)
  config/env.ts                 Zod env schema
  http/                         error format + handler, CSRF origin check
  modules/health/               health.routes.ts + tests
  modules/auth/                 auth.routes.ts, session.ts, password.ts + tests
  test/                         test database setup and app factory

apps/web/src/
  proxy.ts                      forwards /api/v1/*, optimistic redirect for /account
  app/                          routes: /, /login, /register, /account
  components/ui/                shadcn/ui components
  config/env.ts                 server-only env validation
  features/auth/                forms, session lookup, logout button
  features/system-status/       health fetch + status component
```

`buildApp()` receives its dependencies (database client and configuration) as
arguments, so tests run the real app in-process with `fastify.inject` against
a dedicated test database, without opening a port.

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
- Tables: `users` (unique lower-cased email, Argon2id password hash) and
  `sessions` (unique token hash, expiry, foreign key to `users` with
  `ON DELETE CASCADE`). Ids are UUIDv7.
- Integration tests use a separate `<database>_test` database, created and
  migrated on demand by `setupTestDatabase()` (`@syncspace/database/testing`).

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
| Account features  | Email verification, password reset, session management ("log out everywhere").                 |
| Workspaces        | Workspaces, membership and roles; authorisation enforced in the API.                           |
| Documents         | Document metadata and content stored in PostgreSQL through `@syncspace/database`.              |
| Real-time editing | The collaboration service accepts WebSocket connections and synchronises document state between clients. The sync approach (e.g. CRDT-based) is still to be decided. |
| Sharing           | Document-level access and share links.                                                         |
| Deployment        | Container images per app and a deployment pipeline.                                            |

Open decisions to be made in the phases that need them: sync protocol and
persistence format, and how the collaboration service authorises connections
(it will need to validate the same session).
