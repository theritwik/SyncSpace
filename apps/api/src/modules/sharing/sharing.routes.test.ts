import type { PrismaClient, WorkspaceRole } from "@syncspace/database";
import {
  apiErrorResponseSchema,
  collaborationTokenResponseSchema,
  documentListResponseSchema,
  documentPermissionListResponseSchema,
  documentPermissionResponseSchema,
  documentResponseSchema,
  sharedDocumentListResponseSchema,
  workspaceResponseSchema,
  type DocumentRole,
} from "@syncspace/shared";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  apiRequest,
  createTestApp,
  registerTestUser,
  resetDatabase,
  type TestUser,
} from "../../test/test-app.js";

// Integration tests: real Fastify app and real PostgreSQL (the `_test` database).
// Sharing goes through the real endpoints; only workspace memberships other
// than the owner's are inserted directly, because there is no invite API yet.

let app: FastifyInstance;
let database: PrismaClient;
/** Owns the workspace and created the document. */
let owner: TestUser;
/** Registered users with no relation to the workspace. */
let bob: TestUser;
let carol: TestUser;
let slug: string;
let workspaceId: string;
let documentId: string;

const EMAIL = { bob: "bob@example.com", carol: "carol@example.com" };

beforeEach(async () => {
  ({ app, database } = createTestApp());
  await resetDatabase(database);
  owner = await registerTestUser(app, "Olivia Owner", "owner@example.com");
  bob = await registerTestUser(app, "Bob Outsider", EMAIL.bob);
  carol = await registerTestUser(app, "Carol Outsider", EMAIL.carol);

  const workspace = workspaceResponseSchema.parse(
    (await apiRequest(app, "POST", "/workspaces", owner, { name: "Acme" })).json(),
  ).workspace;
  slug = workspace.slug;
  workspaceId = workspace.id;
  documentId = documentResponseSchema.parse(
    (await apiRequest(app, "POST", `/workspaces/${slug}/documents`, owner, { title: "Plan" })).json(),
  ).document.id;
});

afterEach(async () => {
  await app.close();
});

function share(as: TestUser | undefined, email: string, role: string, document = documentId) {
  return apiRequest(app, "POST", `/documents/${document}/permissions`, as, { email, role });
}

async function shareOk(email: string, role: DocumentRole) {
  const response = await share(owner, email, role);
  expect([200, 201]).toContain(response.statusCode);
}

function getDocument(as: TestUser, document = documentId) {
  return apiRequest(app, "GET", `/documents/${document}`, as);
}

async function addWorkspaceMember(role: WorkspaceRole, email: string): Promise<TestUser> {
  const user = await registerTestUser(app, `${role} Member`, email);
  await database.workspaceMember.create({ data: { workspaceId, userId: user.id, role } });
  return user;
}

function errorOf(response: LightMyRequestResponse) {
  return apiErrorResponseSchema.parse(response.json()).error;
}

async function grantOf(userId: string) {
  return database.documentPermission.findUnique({
    where: { documentId_userId: { documentId, userId } },
  });
}

describe("document creation", () => {
  it("makes the creator the owner of the new document", async () => {
    expect(await grantOf(owner.id)).toMatchObject({ role: "OWNER", grantedById: owner.id });

    const member = await addWorkspaceMember("MEMBER", "member@example.com");
    const created = documentResponseSchema.parse(
      (await apiRequest(app, "POST", `/workspaces/${slug}/documents`, member, {})).json(),
    ).document;

    // A plain member is an editor of other documents but owns the ones they create.
    expect(created.role).toBe("OWNER");
    expect(documentResponseSchema.parse((await getDocument(member)).json()).document.role).toBe(
      "EDITOR",
    );
  });
});

describe("POST /api/v1/documents/:id/permissions (share)", () => {
  it("lets the owner share with a registered user by email", async () => {
    const response = await share(owner, "  BOB@example.com ", "VIEWER");

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(documentPermissionResponseSchema.parse(response.json()).permission).toMatchObject({
      userId: bob.id,
      name: "Bob Outsider",
      email: EMAIL.bob,
      role: "VIEWER",
    });
    expect(await grantOf(bob.id)).toMatchObject({ role: "VIEWER", grantedById: owner.id });
  });

  it("gives the recipient access to that document only", async () => {
    const otherDocument = documentResponseSchema.parse(
      (await apiRequest(app, "POST", `/workspaces/${slug}/documents`, owner, {})).json(),
    ).document.id;
    expect((await getDocument(bob)).statusCode).toBe(404);

    await shareOk(EMAIL.bob, "EDITOR");

    const detail = documentResponseSchema.parse((await getDocument(bob)).json()).document;
    expect(detail).toMatchObject({
      role: "EDITOR",
      canEdit: true,
      isWorkspaceMember: false,
      folderPath: [],
      folderId: null,
    });
    expect((await getDocument(bob, otherDocument)).statusCode).toBe(404);
    // No access to the workspace itself, its document list or its folders.
    expect((await apiRequest(app, "GET", `/workspaces/${slug}`, bob)).statusCode).toBe(404);
    expect((await apiRequest(app, "GET", `/workspaces/${slug}/documents`, bob)).statusCode).toBe(404);
    expect((await apiRequest(app, "GET", `/workspaces/${slug}/folders`, bob)).statusCode).toBe(404);
  });

  it("updates the role when the person already has a grant", async () => {
    await shareOk(EMAIL.bob, "VIEWER");

    const response = await share(owner, EMAIL.bob, "EDITOR");

    expect(response.statusCode).toBe(200);
    expect(await database.documentPermission.count({ where: { userId: bob.id } })).toBe(1);
    expect((await grantOf(bob.id))?.role).toBe("EDITOR");
  });

  it("rejects an email that has no account, the sharer's own email, and invalid input", async () => {
    const unknown = await share(owner, "nobody@example.com", "VIEWER");
    const self = await share(owner, "owner@example.com", "EDITOR");
    const badRole = await share(owner, EMAIL.bob, "ADMIN");
    const badEmail = await share(owner, "not-an-email", "VIEWER");
    const noBody = await apiRequest(app, "POST", `/documents/${documentId}/permissions`, owner, {});

    expect(unknown.statusCode).toBe(400);
    expect(errorOf(unknown).details).toEqual([
      { path: "email", message: "No SyncSpace account uses this email address." },
    ]);
    expect(self.statusCode).toBe(400);
    expect([badRole.statusCode, badEmail.statusCode, noBody.statusCode]).toEqual([400, 400, 400]);
    expect(await database.documentPermission.count()).toBe(1); // only the creator's own grant
  });

  it("requires a session", async () => {
    expect((await share(undefined, EMAIL.bob, "VIEWER")).statusCode).toBe(401);
  });

  it("answers 404 to someone without access, as for a document that does not exist", async () => {
    const forbidden = await share(bob, EMAIL.carol, "VIEWER");
    const missing = await share(bob, EMAIL.carol, "VIEWER", "00000000-0000-7000-8000-000000000000");

    expect(forbidden.statusCode).toBe(404);
    expect(forbidden.json()).toEqual(missing.json());
    expect(await grantOf(carol.id)).toBeNull();
  });

  it("is rate limited", async () => {
    await app.close();
    ({ app, database } = createTestApp({ config: { shareRateLimitMax: 2 } }));

    expect((await share(owner, EMAIL.bob, "VIEWER")).statusCode).toBe(201);
    expect((await share(owner, EMAIL.carol, "VIEWER")).statusCode).toBe(201);
    const blocked = await share(owner, EMAIL.bob, "EDITOR");

    expect(blocked.statusCode).toBe(429);
    expect((await grantOf(bob.id))?.role).toBe("VIEWER");
  });
});

describe("who may manage sharing", () => {
  it("lets workspace owners and admins manage sharing of any document in the workspace", async () => {
    const admin = await addWorkspaceMember("ADMIN", "admin@example.com");

    expect((await share(admin, EMAIL.bob, "VIEWER")).statusCode).toBe(201);
  });

  it("lets a co-owner added through sharing manage sharing, even from outside the workspace", async () => {
    await shareOk(EMAIL.bob, "OWNER");

    expect((await share(bob, EMAIL.carol, "EDITOR")).statusCode).toBe(201);
    expect((await getDocument(carol)).statusCode).toBe(200);
  });

  it.each([
    ["an editor by grant", "EDITOR"],
    ["a viewer by grant", "VIEWER"],
  ] as const)("forbids %s from sharing", async (_label, role) => {
    await shareOk(EMAIL.bob, role);

    const response = await share(bob, EMAIL.carol, "VIEWER");

    expect(response.statusCode).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN");
    expect(await grantOf(carol.id)).toBeNull();
  });

  it("forbids a workspace member (editor) from sharing a document they did not create", async () => {
    const member = await addWorkspaceMember("MEMBER", "member@example.com");

    expect((await share(member, EMAIL.bob, "VIEWER")).statusCode).toBe(403);
    expect(await grantOf(bob.id)).toBeNull();
  });
});

describe("privilege escalation attempts", () => {
  it("does not let an editor make themselves or anyone else an owner", async () => {
    await shareOk(EMAIL.bob, "EDITOR");
    await shareOk(EMAIL.carol, "VIEWER");

    const attempts = await Promise.all([
      share(bob, EMAIL.bob, "OWNER"),
      share(bob, EMAIL.carol, "OWNER"),
      apiRequest(app, "PATCH", `/documents/${documentId}/permissions/${bob.id}`, bob, { role: "OWNER" }),
      apiRequest(app, "PATCH", `/documents/${documentId}/permissions/${carol.id}`, bob, { role: "OWNER" }),
      apiRequest(app, "DELETE", `/documents/${documentId}/permissions/${owner.id}`, bob),
    ]);

    expect(attempts.map((response) => response.statusCode)).toEqual([403, 403, 403, 403, 403]);
    expect((await grantOf(bob.id))?.role).toBe("EDITOR");
    expect((await grantOf(carol.id))?.role).toBe("VIEWER");
    expect((await grantOf(owner.id))?.role).toBe("OWNER");
  });

  it("does not let a viewer change anything", async () => {
    await shareOk(EMAIL.bob, "VIEWER");

    const attempts = await Promise.all([
      apiRequest(app, "PATCH", `/documents/${documentId}`, bob, { title: "Hacked" }),
      apiRequest(app, "DELETE", `/documents/${documentId}`, bob),
      share(bob, EMAIL.bob, "EDITOR"),
      apiRequest(app, "PATCH", `/documents/${documentId}/permissions/${bob.id}`, bob, { role: "EDITOR" }),
    ]);

    expect(attempts.map((response) => response.statusCode)).toEqual([403, 403, 403, 403]);
    expect((await database.document.findUniqueOrThrow({ where: { id: documentId } })).title).toBe("Plan");
    expect((await grantOf(bob.id))?.role).toBe("VIEWER");
  });

  it("ignores role and identity fields a client adds to other requests", async () => {
    await shareOk(EMAIL.bob, "VIEWER");

    // Claiming a role or another user in the body or headers changes nothing.
    const response = await app.inject({
      method: "PATCH",
      url: `/api/v1/documents/${documentId}`,
      headers: { origin: "http://localhost:3000", "x-role": "OWNER", "x-user-id": owner.id },
      cookies: bob.cookies,
      payload: { title: "Hacked", role: "OWNER", canEdit: true, userId: owner.id },
    });

    expect(response.statusCode).toBe(403);
    // The grantor is always the signed-in user, whatever the body says.
    const forged = await apiRequest(app, "POST", `/documents/${documentId}/permissions`, owner, {
      email: EMAIL.carol,
      role: "VIEWER",
      grantedById: bob.id,
      userId: bob.id,
    });
    expect(forged.statusCode).toBe(201);
    expect(await grantOf(carol.id)).toMatchObject({ userId: carol.id, grantedById: owner.id });
  });

  it("does not let an owner change or remove their own grant", async () => {
    await shareOk(EMAIL.bob, "OWNER");

    const change = await apiRequest(app, "PATCH", `/documents/${documentId}/permissions/${bob.id}`, bob, { role: "VIEWER" });
    const remove = await apiRequest(app, "DELETE", `/documents/${documentId}/permissions/${bob.id}`, bob);

    expect([change.statusCode, remove.statusCode]).toEqual([403, 403]);
    expect((await grantOf(bob.id))?.role).toBe("OWNER");
  });

  it("does not let someone with a grant on one document act on another", async () => {
    const otherDocument = documentResponseSchema.parse(
      (await apiRequest(app, "POST", `/workspaces/${slug}/documents`, owner, {})).json(),
    ).document.id;
    await shareOk(EMAIL.bob, "OWNER");

    const responses = await Promise.all([
      share(bob, EMAIL.carol, "EDITOR", otherDocument),
      apiRequest(app, "GET", `/documents/${otherDocument}/permissions`, bob),
      apiRequest(app, "PATCH", `/documents/${otherDocument}`, bob, { title: "Hacked" }),
      apiRequest(app, "POST", `/documents/${otherDocument}/collaboration-token`, bob),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([404, 404, 404, 404]);
  });

  it("does not let a grant-only editor move the document or create things in the workspace", async () => {
    await shareOk(EMAIL.bob, "EDITOR");
    const folder = await database.folder.create({ data: { name: "Folder", workspaceId } });

    const move = await apiRequest(app, "PATCH", `/documents/${documentId}`, bob, { folderId: folder.id });
    const create = await apiRequest(app, "POST", `/workspaces/${slug}/documents`, bob, {});
    const createFolder = await apiRequest(app, "POST", `/workspaces/${slug}/folders`, bob, { name: "X" });

    expect([move.statusCode, create.statusCode, createFolder.statusCode]).toEqual([403, 404, 404]);
    expect((await database.document.findUniqueOrThrow({ where: { id: documentId } })).folderId).toBeNull();
  });
});

describe("effective permissions on document routes", () => {
  it("lets an editor by grant rename, but not delete", async () => {
    await shareOk(EMAIL.bob, "EDITOR");

    const rename = await apiRequest(app, "PATCH", `/documents/${documentId}`, bob, { title: "Renamed by Bob" });
    const remove = await apiRequest(app, "DELETE", `/documents/${documentId}`, bob);

    expect(rename.statusCode).toBe(200);
    expect(remove.statusCode).toBe(403);
  });

  it("lets a grant raise a workspace viewer to editor for one document", async () => {
    const viewer = await addWorkspaceMember("VIEWER", "viewer@example.com");
    expect((await apiRequest(app, "PATCH", `/documents/${documentId}`, viewer, { title: "No" })).statusCode).toBe(403);

    await shareOk("viewer@example.com", "EDITOR");

    expect((await apiRequest(app, "PATCH", `/documents/${documentId}`, viewer, { title: "Yes" })).statusCode).toBe(200);
    const listed = documentListResponseSchema.parse(
      (await apiRequest(app, "GET", `/workspaces/${slug}/documents`, viewer)).json(),
    ).documents;
    expect(listed.find((document) => document.id === documentId)?.role).toBe("EDITOR");
  });

  it("never lets a grant reduce a workspace member's access", async () => {
    const member = await addWorkspaceMember("MEMBER", "member@example.com");

    await shareOk("member@example.com", "VIEWER");

    expect(documentResponseSchema.parse((await getDocument(member)).json()).document.role).toBe("EDITOR");
    expect((await apiRequest(app, "PATCH", `/documents/${documentId}`, member, { title: "Still can" })).statusCode).toBe(200);
  });

  it("lets only owners delete: a member cannot delete a document they did not create", async () => {
    const member = await addWorkspaceMember("MEMBER", "member@example.com");

    expect((await apiRequest(app, "DELETE", `/documents/${documentId}`, member)).statusCode).toBe(403);
    expect((await apiRequest(app, "DELETE", `/documents/${documentId}`, owner)).statusCode).toBe(204);
  });

  it("issues a collaboration token to anyone with access and to nobody else", async () => {
    await shareOk(EMAIL.bob, "VIEWER");

    const granted = await apiRequest(app, "POST", `/documents/${documentId}/collaboration-token`, bob);
    const refused = await apiRequest(app, "POST", `/documents/${documentId}/collaboration-token`, carol);

    expect(granted.statusCode).toBe(200);
    expect(collaborationTokenResponseSchema.safeParse(granted.json()).success).toBe(true);
    expect(refused.statusCode).toBe(404);
  });
});

describe("PATCH / DELETE /api/v1/documents/:id/permissions/:userId", () => {
  it("lets the owner change a collaborator's role", async () => {
    await shareOk(EMAIL.bob, "VIEWER");

    const response = await apiRequest(app, "PATCH", `/documents/${documentId}/permissions/${bob.id}`, owner, { role: "EDITOR" });

    expect(response.statusCode).toBe(200);
    expect(documentPermissionResponseSchema.parse(response.json()).permission.role).toBe("EDITOR");
    expect((await apiRequest(app, "PATCH", `/documents/${documentId}`, bob, { title: "Now I can" })).statusCode).toBe(200);
  });

  it("revokes access immediately when the owner removes a collaborator", async () => {
    await shareOk(EMAIL.bob, "EDITOR");
    expect((await getDocument(bob)).statusCode).toBe(200);

    const response = await apiRequest(app, "DELETE", `/documents/${documentId}/permissions/${bob.id}`, owner);

    expect(response.statusCode).toBe(204);
    // Same session cookie as before: no new login is involved.
    expect((await getDocument(bob)).statusCode).toBe(404);
    expect((await apiRequest(app, "PATCH", `/documents/${documentId}`, bob, { title: "Still here?" })).statusCode).toBe(404);
    expect((await apiRequest(app, "POST", `/documents/${documentId}/collaboration-token`, bob)).statusCode).toBe(404);
    expect(sharedDocumentListResponseSchema.parse((await apiRequest(app, "GET", "/documents/shared", bob)).json()).documents).toEqual([]);
  });

  it("applies a downgrade immediately", async () => {
    await shareOk(EMAIL.bob, "EDITOR");

    await apiRequest(app, "PATCH", `/documents/${documentId}/permissions/${bob.id}`, owner, { role: "VIEWER" });

    expect((await apiRequest(app, "PATCH", `/documents/${documentId}`, bob, { title: "No more" })).statusCode).toBe(403);
    expect((await getDocument(bob)).statusCode).toBe(200);
  });

  it("answers 404 for a user without a grant and 400 for malformed ids or roles", async () => {
    const noGrant = await apiRequest(app, "DELETE", `/documents/${documentId}/permissions/${carol.id}`, owner);
    const badId = await apiRequest(app, "DELETE", `/documents/${documentId}/permissions/not-a-uuid`, owner);
    await shareOk(EMAIL.bob, "VIEWER");
    const badRole = await apiRequest(app, "PATCH", `/documents/${documentId}/permissions/${bob.id}`, owner, { role: "SUPERUSER" });

    expect([noGrant.statusCode, badId.statusCode, badRole.statusCode]).toEqual([404, 400, 400]);
  });
});

describe("GET /api/v1/documents/:id/permissions", () => {
  it("shows collaborators with emails to owners", async () => {
    await shareOk(EMAIL.bob, "EDITOR");

    const response = await apiRequest(app, "GET", `/documents/${documentId}/permissions`, owner);

    expect(response.statusCode).toBe(200);
    expect(
      documentPermissionListResponseSchema
        .parse(response.json())
        .permissions.map(({ email, role }) => ({ email, role })),
    ).toEqual([
      { email: "owner@example.com", role: "OWNER" },
      { email: EMAIL.bob, role: "EDITOR" },
    ]);
  });

  it("shows names and roles but no email addresses to non-owners", async () => {
    await shareOk(EMAIL.bob, "VIEWER");

    const response = await apiRequest(app, "GET", `/documents/${documentId}/permissions`, bob);

    const { permissions } = documentPermissionListResponseSchema.parse(response.json());
    expect(permissions.map(({ name, email }) => ({ name, email }))).toEqual([
      { name: "Olivia Owner", email: null },
      { name: "Bob Outsider", email: null },
    ]);
    expect(response.body).not.toContain("@example.com");
  });

  it("answers 404 to someone without access", async () => {
    expect((await apiRequest(app, "GET", `/documents/${documentId}/permissions`, bob)).statusCode).toBe(404);
  });
});

describe("GET /api/v1/documents/shared", () => {
  it("lists documents shared with the user from other workspaces, with their role", async () => {
    await shareOk(EMAIL.bob, "VIEWER");

    const response = await apiRequest(app, "GET", "/documents/shared", bob);

    expect(response.statusCode).toBe(200);
    expect(sharedDocumentListResponseSchema.parse(response.json()).documents).toEqual([
      expect.objectContaining({ id: documentId, title: "Plan", role: "VIEWER", workspaceName: "Acme" }),
    ]);
  });

  it("omits deleted documents, documents of the user's own workspaces, and other people's shares", async () => {
    await shareOk(EMAIL.bob, "EDITOR");
    await apiRequest(app, "DELETE", `/documents/${documentId}`, owner);

    const list = async (user: TestUser) =>
      sharedDocumentListResponseSchema.parse((await apiRequest(app, "GET", "/documents/shared", user)).json()).documents;

    expect(await list(bob)).toEqual([]);
    expect(await list(owner)).toEqual([]);
    expect(await list(carol)).toEqual([]);
    expect((await apiRequest(app, "GET", "/documents/shared")).statusCode).toBe(401);
  });
});
