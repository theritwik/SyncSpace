# SyncSpace architecture

This document separates what **exists today** from what is **planned**.
Anything under "Planned" is a direction, not an implementation.

## Current architecture (Phase 5 — real-time collaborative editor)

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
                 │  /api/v1/workspaces  │
                 │  /api/v1/documents   │
                 └──────────┬───────────┘
                            │ Prisma + node-postgres adapter (DATABASE_URL)
                            ▼
                 ┌──────────────────────┐
                 │  PostgreSQL 17       │  :5432 (Docker Compose)
                 └──────────────────────┘

  Browser ──WebSocket (Yjs sync + awareness)──┐
                                              ▼
                 ┌──────────────────────┐   reads sessions/memberships,
                 │  collaboration       │   reads/writes document_contents
                 │  (Hocuspocus)  :4001 │ ───────────────▶ PostgreSQL
                 └──────────────────────┘
```

### Workspace packages

| Package                    | Responsibility                                                                 |
| -------------------------- | ------------------------------------------------------------------------------ |
| `@syncspace/web`           | Next.js App Router frontend: landing page, login, registration, and the signed-in dashboard (workspaces, settings, account). |
| `@syncspace/api`           | Fastify REST API: health check, authentication and workspaces.                 |
| `@syncspace/collaboration` | Hocuspocus server: real-time document sync, presence, access checks and persistence of document content. |
| `@syncspace/database`      | Prisma schema (`User`, `Session`, `Workspace`, `WorkspaceMember`), migrations, generated client, test-database helper. |
| `@syncspace/shared`        | Env validation helper, the API contracts (Zod) for auth, workspaces, errors and health, and the role permission rules. |

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

## Workspaces

### Data model

```
users ──< workspace_members >── workspaces
            role: OWNER | ADMIN | MEMBER
            primary key (workspace_id, user_id)
```

A workspace has no owner column. Access is granted only by a row in
`workspace_members`, so "who can see this workspace" and "what may they do"
are answered by one table, and adding invitations later needs no schema
change. Deleting a workspace or a user removes the related memberships
(`ON DELETE CASCADE`).

Creating a workspace inserts the workspace and its `OWNER` membership inside
one database transaction, so a workspace can never exist without an owner.

Each workspace has a `slug` used in URLs (`/w/acme-design-k3x9qa`). It is
generated once from the name plus a random suffix and never changes, so links
survive a rename.

### Access control

Every workspace route calls `requireWorkspaceAccess()`
(`apps/api/src/modules/workspaces/workspace.access.ts`), which looks the
workspace up *through the caller's membership*:

| Situation                          | Response |
| ---------------------------------- | -------- |
| No session                         | `401`    |
| Not a member (or no such workspace)| `404`    |
| Member, but role too low           | `403`    |

Non-members get `404` rather than `403` so the API does not reveal which
slugs exist. The permission rules (`canManageWorkspace`, `canDeleteWorkspace`)
live in `@syncspace/shared`: the API enforces them, and the web app uses the
same functions only to decide which controls to show.

| Action            | Owner | Admin | Member |
| ----------------- | ----- | ----- | ------ |
| View, list members| yes   | yes   | yes    |
| Rename            | yes   | yes   | no     |
| Delete            | yes   | no    | no     |

### Dashboard (web)

- `app/(app)/layout.tsx` wraps every signed-in page. It verifies the session,
  loads the user's workspaces once, and renders the shell: sidebar with
  workspace switcher and navigation, header with search and user menu.
- **Reads** happen in server components through `lib/api-server.ts`, which
  forwards the session cookie to the API. **Writes** are sent by client
  components through `lib/api-client.ts` (via `proxy.ts`), followed by
  `router.refresh()` so server-rendered data such as the sidebar is reloaded.
  There is no client-side state library.
- The current workspace is derived from the URL, not stored anywhere.
- Loading states are `loading.tsx` skeletons per page; errors are caught by
  `error.tsx` boundaries (inside the shell when only a page fails, full-page
  when the session check itself fails); unknown or inaccessible workspaces
  render a not-found state.
- Accessibility: skip link, landmarks, `aria-current` on the active link,
  focus-managed dialogs and menus (Radix), and a keyboard-driven search
  dialog (`Ctrl`/`⌘` + `K`).

### Known limitations

- **No invitations or role changes yet.** Non-owner roles can only be created
  directly in the database (as the integration tests do).
- **Ownership cannot be transferred**, and there is always exactly one way to
  remove a workspace: the owner deletes it.
- **No pagination** of the workspace or member lists, and no limit on how many
  workspaces a user may create.
- **Search covers workspaces and pages only**, filtered in the browser from
  the already-loaded list.
- **No automated browser tests.** The UI was verified with one-off browser
  scripts, not a committed suite.

## Documents and folders

### Data model

```
workspaces ──< folders ──< folders (parent_id, nested)
     │            │
     └────────────┴──< documents (folder_id nullable, deleted_at nullable)
```

- A document belongs to exactly one workspace and optionally to one folder.
  `folder_id = NULL` means the top level of the workspace.
- **Workspace mismatches are impossible at the database level.** `folders`
  has a unique key on `(id, workspace_id)`, and both `documents.folder_id`
  and `folders.parent_id` reference it together with their own
  `workspace_id` (composite foreign keys). A document or subfolder can
  therefore only point at a folder of the same workspace, whatever the
  application code does.
- A `CHECK` constraint forbids a folder from being its own parent. Longer
  cycles cannot arise because a folder's parent is set at creation and there
  is no operation that changes it. Nesting is limited to 5 levels by the API.
- **Soft deletion:** deleting a document sets `deleted_at`. Every query
  filters on `deleted_at IS NULL`, so a deleted document behaves as if it did
  not exist, while the row remains for a future trash/restore feature.
- `created_by_id` is set to `NULL` if the creating user is deleted, so
  content outlives accounts.
- Deleting a workspace removes its folders and documents (`ON DELETE
  CASCADE`). Deleting a folder would also remove its subfolders and
  documents; no API does that yet.
- Index `(workspace_id, deleted_at, updated_at DESC)` serves the main query:
  a workspace's live documents, most recently updated first.

### Access control

There are no per-document permissions: access follows workspace membership.
Owners, admins and members may create, rename, move and delete documents and
create folders; viewers may only read (`403` on writes).

- `/workspaces/:slug/...` routes go through `requireWorkspaceAccess()`, as
  the workspace routes do.
- `/documents/:id` routes go through `requireDocumentAccess()`, which loads
  the document only if it is not deleted **and** the caller is a member of
  its workspace. Anything else is `404`.
- A `folderId`/`parentId` in a request body is checked against the folders
  of the target workspace and rejected with `400` otherwise, which is also
  the answer for a folder of another workspace.

### Web

- `/w/[slug]/documents` and `/w/[slug]/folders/[folderId]` render the same
  `DocumentBrowser`: breadcrumbs, subfolders and the documents of one level.
- `/documents/[documentId]` is the document page. Its URL contains no
  workspace, so the page announces its workspace to the sidebar through a
  small React context (`features/dashboard/active-workspace.tsx`).
- The workspace overview shows the five most recently updated documents.
- "Updated" reflects the last rename or move; there is no content to edit yet.

### Known limitations

- **No trash, restore or permanent deletion** of soft-deleted documents.
- **Folders cannot be renamed, moved or deleted.**
- **Lists are capped at 100 documents** per request and have no pagination.
- **Names are not unique:** two documents or sibling folders may share a name.
- **Search does not cover documents** yet (workspaces and pages only).
- **Timestamps are shown in UTC**, because they are rendered on the server.

## Real-time collaboration

### The moving parts

| Part | Role |
| --- | --- |
| **Yjs** | A CRDT: a document format in which any two copies can always be merged, in any order, into the same result. Every browser tab and the server hold a copy. |
| **Tiptap** | The editor. Its Collaboration extension binds the editor to a Yjs document, so typing changes the CRDT and remote changes update the editor. |
| **Hocuspocus** | Server (`apps/collaboration`) and browser provider that exchange Yjs updates over a WebSocket using the standard Yjs sync and awareness protocols. No custom sync messages are defined. |
| **PostgreSQL** | Stores each document's Yjs state in `document_contents`. |

Each document is one "room", named by the document's id. The Yjs document is
the only copy of the content: nothing editable is kept as HTML or JSON, and
the REST API neither returns nor accepts content.

### Opening a document

```
Browser                         API                    Collaboration server        PostgreSQL
  │  POST /documents/:id/collaboration-token (cookie)       │                          │
  │ ───────────────────────────▶│  session + membership check ───────────────────────▶│
  │ ◀── token (60 s, signed) ───│                           │                          │
  │  WebSocket + token ───────────────────────────────────▶ │ verify signature         │
  │                                                         │ session, membership, role ▶│
  │                                                         │ load document state ─────▶│
  │ ◀═══════════ Yjs sync, then live updates ═════════════▶ │                          │
```

- The **token** (`packages/shared/src/collaboration-token.ts`) is an
  HMAC-signed statement "user U, in login session S, may ask to open document
  D, until time T". It is needed because the collaboration server is a
  separate origin and never sees the session cookie. It contains **no role**.
- The **collaboration server** verifies the signature and expiry, requires
  the token's document to be the room being opened, and then looks everything
  else up in the database itself (`apps/collaboration/src/access.ts`): the
  session must still exist, the document must not be deleted, the user must be
  a member. The user's role decides read-write or read-only.
- Unknown or malformed room names never create a room or a database row.

### Permissions

| Role | Editor | Enforced by |
| --- | --- | --- |
| Owner, Admin, Member | read and write | — |
| Viewer | read-only | the server marks the connection read-only and Hocuspocus discards every document update it sends |
| not a member | no connection | `onAuthenticate` rejects it |

The browser hides the toolbar and locks the editor based on the scope the
*server* reports after authentication, but that is presentation only. A
modified client that sends updates anyway is ignored (covered by tests).

### Persistence and the "Saved" state

- **Load:** when the first client opens a document, the server applies the
  stored state to a new Yjs document. Hocuspocus loads a document once even
  if several clients connect at the same moment.
- **Store:** after changes the server writes the full state, debounced
  (2 s after the last change, at most every 10 s), when the last client
  leaves, and on shutdown (`SIGTERM`/`SIGINT` flush all unsaved documents).
- **Never overwrite:** a store locks the existing row, merges it into the
  live document, and writes the merged state in one transaction. A stale
  writer therefore cannot erase newer content; it merges with it.
- **Honest status:** after each store the server sends clients a Yjs snapshot
  of exactly what it wrote. A client shows "Saved" only while its own
  document is equal to that snapshot. Any local or remote change turns it
  into "Syncing…" or "Saving…" until a later snapshot matches again.
- Storing content also updates `documents.updated_at`. Merely opening a
  document writes nothing.
- **Presence is never stored.** Names and cursor positions travel through the
  Yjs awareness protocol, live in memory only, and are removed when a client
  disconnects, cleanly or not.

### Disconnection and recovery

- The provider reconnects automatically with backoff and requests a fresh
  token each time. On reconnect, client and server exchange what the other is
  missing; edits made offline are merged, not replayed over newer content.
- While offline, editing continues in the tab and the status says so.
  Offline edits are **not** stored in the browser: closing the tab loses
  them (the page asks for confirmation first).
- **Server restart or crash:** everything written to PostgreSQL is reloaded.
  Clients that stayed open still hold the document and send anything the
  server is missing when they reconnect.
- **Access revoked while connected:** every
  `COLLABORATION_ACCESS_RECHECK_SECONDS` (default 30) the server re-validates
  all open connections against the database and closes those whose session
  ended, whose membership was removed, or whose document was deleted. The
  client's reconnect is then refused, the editor is locked and shows
  "No access". If the login itself has ended, the page goes to the login
  screen. A role change (e.g. member to viewer) forces a reconnect so the new
  permission applies.
- Undo/redo is provided by the Collaboration extension (Yjs undo manager) and
  only reverts the user's own changes; Tiptap's regular history is disabled.

### Known limitations

- **Single collaboration server instance.** Rooms live in one process's
  memory. Running several instances needs a shared pub/sub layer (the usual
  choice is Redis), which is deliberately not included yet. The merge-on-store
  logic prevents data loss if two instances ever overlap, but they would not
  see each other's live edits.
- **Up to 10 seconds of acknowledged edits can be lost if the server process
  is killed** without a graceful shutdown and no client that has them stays
  open. The UI shows "Saving…", not "Saved", during that window.
- **Revocation is not instant:** it takes up to the re-check interval.
- **No offline storage** in the browser (no IndexedDB persistence).
- **Presence names and colours are self-reported** by authenticated clients.
  A member with a modified client could display another name. Document
  permissions are unaffected.
- **No version history, comments, suggestions, or export.** Deleted text is
  not recoverable through the UI.
- **Document state only grows slowly smaller:** Yjs garbage-collects deleted
  content but keeps some metadata; there is no compaction job.
- **No size or rate limits** on documents or on updates from an authorised
  editor.
- **No links, images or tables** in the editor yet.
- **The "Last updated" time in the document header** is rendered when the
  page loads and does not tick while you edit.
- **The token secret is shared** between API and collaboration service and
  must be rotated on both together.
- **The viewer role cannot be assigned from the UI** (no member management yet).
- **Automated tests cover the server with real clients; the browser editor
  itself was verified with one-off two-browser scripts**, not a committed
  browser test suite.

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
  modules/workspaces/           workspace.routes.ts, workspace.access.ts, slug.ts + tests
  modules/folders/              folder.routes.ts + tests
  modules/documents/            document.routes.ts, document.access.ts + tests
  modules/collaboration/        collaboration.routes.ts (token endpoint only) + tests

apps/collaboration/src/
  main.ts                       process entry: env, database, listen, re-check timer, shutdown
  collaboration-server.ts       Hocuspocus hooks: authenticate, load, store, saved messages, re-check
  access.ts                     who may open a document, read-only or not (from the database)
  persistence.ts                load and merge-store of Yjs state
  config/env.ts                 Zod env schema
  test/                         test database setup and app factory

apps/web/src/
  proxy.ts                      forwards /api/v1/*, optimistic redirect for signed-in pages
  app/                          /, (auth)/login, (auth)/register,
                                (app)/dashboard, (app)/account,
                                (app)/w/[slug], .../settings, .../documents, .../folders/[folderId],
                                (app)/documents/[documentId]
  components/                   shared building blocks (form field, page header, empty state)
  components/ui/                shadcn/ui components
  config/env.ts                 server-only env validation
  lib/                          api-server.ts (reads), api-client.ts (writes), formatting helpers
  features/auth/                forms, session lookup, logout button
  features/dashboard/           app shell: sidebar, switcher, search, user menu, skeletons
  features/workspaces/          data loading, create/rename/delete, lists, settings
  features/documents/           data loading, document browser, document page, rename/move/delete, folders
  features/editor/              collaboration session (provider, status), Tiptap editor, toolbar, presence
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
- Tables: `users` (unique lower-cased email, Argon2id password hash),
  `sessions` (unique token hash, expiry, foreign key to `users` with
  `ON DELETE CASCADE`), `workspaces` (unique slug), `workspace_members`
  (composite primary key, role enum), `folders`, `documents` and
  `document_contents` (Yjs state as `bytea`, one row per document, kept out
  of the `documents` table so lists never load it). Ids are UUIDv7.
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

| Area              | Intent                                                                                         |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| Account features  | Email verification, password reset, session management ("log out everywhere").                 |
| Membership        | Invitations, role changes (including assigning viewers), removing members, ownership transfer. |
| Sharing           | Document-level access and share links.                                                         |
| Editor            | Links, images, tables; comments; version history; offline storage in the browser.              |
| Scaling           | Several collaboration server instances behind a shared pub/sub layer (e.g. Redis).             |
| Deployment        | Container images per app and a deployment pipeline.                                            |
