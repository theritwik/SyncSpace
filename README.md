# SyncSpace

A collaborative document workspace, built as a pnpm monorepo.

> **Status: Phase 6 — document sharing and permissions.** Users can register
> and log in, manage workspaces, organise documents in nested folders, edit
> them together in real time, and share individual documents with other
> registered users as owner, editor or viewer. Workspace invitations, public
> links, comments and version history are **not implemented**. See [docs/architecture.md](docs/architecture.md)
> for what exists today and what is planned.

## Tech stack

| Area       | Technology                                                 |
| ---------- | ---------------------------------------------------------- |
| Web        | Next.js 16 (App Router), React 19, Tailwind CSS 4, shadcn/ui |
| API        | Node.js 24 LTS, Fastify 5                                  |
| Auth       | Argon2id password hashing, database-backed sessions in HttpOnly cookies |
| Editor     | Tiptap 3, Yjs (CRDT), Hocuspocus 4 over WebSockets, content stored in PostgreSQL |
| Database   | PostgreSQL 17, Prisma 7 (`@prisma/adapter-pg`)             |
| Validation | Zod 4                                                      |
| Tooling    | pnpm workspaces, TypeScript 6 (strict), ESLint, Vitest     |
| Infra      | Docker Compose (local PostgreSQL), GitHub Actions          |

## Repository layout

```
apps/
  web/            Next.js frontend
  api/            Fastify REST API
  collaboration/  Real-time collaboration server (Hocuspocus/Yjs over WebSockets)
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
| Dashboard (protected) | http://localhost:3000/dashboard |
| Workspace (protected) | http://localhost:3000/w/&lt;slug&gt; and `/w/<slug>/settings` |
| Documents (protected) | `/w/<slug>/documents`, `/w/<slug>/folders/<folderId>`, `/documents/<documentId>` |
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

## Workspaces

All routes require a session.

| Method | Route                              | Who                 | Description                                   |
| ------ | ---------------------------------- | ------------------- | --------------------------------------------- |
| GET    | `/api/v1/workspaces`               | any signed-in user  | Workspaces the user is a member of            |
| POST   | `/api/v1/workspaces`               | any signed-in user  | Create a workspace; the creator becomes owner |
| GET    | `/api/v1/workspaces/:slug`         | members             | One workspace, with the caller's role         |
| PATCH  | `/api/v1/workspaces/:slug`         | owner, admin        | Rename                                        |
| DELETE | `/api/v1/workspaces/:slug`         | owner               | Delete the workspace and its memberships      |
| GET    | `/api/v1/workspaces/:slug/members` | members             | Member list                                   |

A user who is not a member gets `404`, exactly as for a workspace that does not
exist. A member whose role is too low gets `403`.

Roles `OWNER`, `ADMIN` and `MEMBER` exist in the data model and are enforced by
the API, but there is no way to invite members yet, so every workspace
currently has exactly one member: its owner.

In the dashboard, the header search (`Ctrl`/`⌘` + `K`) finds workspaces and
pages; the sidebar switcher changes workspace.

## Documents and folders

All routes require a session and membership of the workspace. Anything the
caller may not see answers `404`.

| Method | Route                                 | Description                                                       |
| ------ | ------------------------------------- | ----------------------------------------------------------------- |
| POST   | `/api/v1/workspaces/:slug/documents`  | Create a document (`title` and `folderId` optional)               |
| GET    | `/api/v1/workspaces/:slug/documents`  | List documents, most recently updated first. Query: `folderId` (a folder id or `root`), `limit` (1–100) |
| GET    | `/api/v1/documents/:id`               | One document with its workspace and folder path                   |
| PATCH  | `/api/v1/documents/:id`               | Rename (`title`) and/or move (`folderId`, `null` = top level)     |
| DELETE | `/api/v1/documents/:id`               | Soft delete                                                       |
| POST   | `/api/v1/workspaces/:slug/folders`    | Create a folder (`parentId` optional, at most 5 levels deep)      |
| GET    | `/api/v1/workspaces/:slug/folders`    | All folders of the workspace as a flat list                       |

Workspaces are addressed by their slug, as in the workspace routes; documents
and folders by id.

- Renaming needs the editor role on the document, deleting the owner role,
  and moving an editing role in the workspace as well.
- **Soft delete** sets `deleted_at`. The row stays in the database, but the
  document disappears from every endpoint. There is no trash or restore yet.
- **Folders** can be nested and are created in place; they cannot be renamed,
  moved or deleted yet.
- A document can only be placed in a folder of its own workspace. The API
  validates this, and a composite foreign key in the database enforces it.
- Document **content** is not part of this REST API. It is synchronised by
  the collaboration service (next section).

## Sharing and permissions

A document can be shared with any registered user by email, from the **Share**
button on the document page. Three document roles exist:

| Role   | Read | Edit content and title | Share, change roles, remove people | Delete |
| ------ | ---- | ---------------------- | ---------------------------------- | ------ |
| Owner  | yes  | yes                    | yes                                | yes    |
| Editor | yes  | yes                    | no                                 | no     |
| Viewer | yes  | no                     | no                                 | no     |

A user's **effective role** for a document is the higher of:

- what their workspace role implies (workspace owner/admin → owner,
  member → editor, viewer → viewer), and
- a role granted on that document by sharing.

The person who creates a document becomes its owner. People outside the
workspace who are given access see only that document, under **Shared with
me**; they cannot see the workspace, its other documents or its folders.

| Method | Route                                        | Who                | Description                                                 |
| ------ | -------------------------------------------- | ------------------ | ----------------------------------------------------------- |
| GET    | `/api/v1/documents/shared`                   | signed-in user     | Documents shared with you from other workspaces             |
| GET    | `/api/v1/documents/:id/permissions`          | anyone with access | People the document is shared with (emails only for owners) |
| POST   | `/api/v1/documents/:id/permissions`          | owner              | Share by `email` with a `role`, or change an existing grant |
| PATCH  | `/api/v1/documents/:id/permissions/:userId`  | owner              | Change a collaborator's role                                |
| DELETE | `/api/v1/documents/:id/permissions/:userId`  | owner              | Remove a collaborator                                       |

The same rule is enforced on REST requests and on editor connections. A
change of role or a removal reaches a user who has the document open within
`COLLABORATION_ACCESS_RECHECK_SECONDS` (30 s by default), without them
logging in again. There are no public or anonymous links.

The full model and its limitations are in
[docs/architecture.md](docs/architecture.md#authorization-model).

## Collaborative editor

Open a document at `/documents/<documentId>` in two browsers (two different
accounts that are members of the workspace) to see it.

- **Editing:** headings, bold, italic, underline, strikethrough, inline code,
  bulleted and numbered lists, quotes, code blocks, undo/redo (undo only
  reverts your own changes).
- **Real time:** edits appear in other browsers as they are typed. Concurrent
  edits are merged by Yjs, a CRDT, so all clients end up with the same text.
- **Presence:** avatars of the people in the document and their live cursors,
  each person with a stable colour.
- **Persistence:** the collaboration service stores the document in
  PostgreSQL about 2 seconds after the last change (at most 10 seconds while
  typing continues), and again on shutdown.
- **Status line** above the editor, each state meaning exactly what it says:

  | Status       | Meaning                                                                 |
  | ------------ | ----------------------------------------------------------------------- |
  | Connecting…  | The document has not been loaded yet                                    |
  | Syncing…     | Connected; the server has not acknowledged all your edits               |
  | Saving…      | The server has your edits; not all are in the database yet              |
  | Saved        | Your copy is identical to what the server wrote to the database         |
  | Offline      | No connection; recent edits exist only in this browser tab              |
  | View only    | Your role is Viewer: you see live updates but cannot edit               |
  | No access    | The server refused access (removed from the workspace, document deleted) |

- **Permissions:** owners and editors of a document can edit; viewers are
  read-only, enforced on the server (see "Sharing and permissions").

`POST /api/v1/documents/:id/collaboration-token` is the only REST endpoint
involved: it gives a signed-in member a 60-second token for opening the
WebSocket connection.

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
| `COLLABORATION_TOKEN_SECRET`                                          | API, Collaboration | Shared key for signing/verifying editor connection tokens (required, min. 32 characters) |
| `COLLABORATION_ACCESS_RECHECK_SECONDS`                                | Collaboration  | How often open connections are re-checked against the database (default `30`) |
| `COLLABORATION_URL`                                                   | Web (server)   | WebSocket URL of the collaboration service as the browser reaches it (required for the editor) |
| `API_URL`                                                             | Web (server)   | Base URL of the API; `/api/v1/*` is forwarded to it (required) |

The credentials in `.env.example` are for local development only.

## Database workflow

The Prisma schema lives in `packages/database/prisma/schema.prisma`.

1. Edit the schema.
2. Run `pnpm db:migrate` — Prisma creates a SQL migration in
   `packages/database/prisma/migrations`, applies it and regenerates the client.
3. Commit the migration.

Current tables: `users`, `sessions`, `workspaces`, `workspace_members`,
`folders`, `documents`, `document_contents` and `document_permissions`. The first migration is an intentional
empty baseline that establishes the migration history.

## Testing

```bash
pnpm db:up   # the database integration tests need PostgreSQL
pnpm test
```

Integration tests never touch development data. Before they run, a separate
`<database>_test` database (for example `syncspace_test`) is created on the
same PostgreSQL server and migrated automatically (the collaboration tests
use their own, `<database>_test_collaboration`, because they run in parallel
with the API tests).

- `apps/api` — auth, workspace, document and folder (access control, validation,
  soft delete) and health route
  tests against the real app, real PostgreSQL and real Argon2 hashing (requests
  sent in-process with `fastify.inject`), plus env validation tests
- `apps/collaboration` — two real WebSocket clients against a real server and
  PostgreSQL: convergence of concurrent edits, presence cleanup, persistence
  and recovery after a restart, reconnection, rejected connections, read-only
  viewers (including hand-built update frames sent directly on the WebSocket),
  and role changes and revocation for users who are already connected
- `apps/api` also covers the collaboration token endpoint, the viewer role, and
  sharing: who may share, effective roles, revocation and privilege-escalation
  attempts
- `packages/database` — connection, unique-constraint, cascade,
  transaction-rollback and cross-workspace integrity tests
- `packages/shared` — schema and env validation helper tests

There are no automated browser tests yet.

## Adding UI components

shadcn/ui is configured in `apps/web/components.json`:

```bash
cd apps/web
pnpm dlx shadcn@latest add button
```
