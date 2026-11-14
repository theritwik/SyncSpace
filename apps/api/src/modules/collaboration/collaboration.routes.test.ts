import type { PrismaClient, WorkspaceRole } from "@syncspace/database";
import {
  collaborationTokenResponseSchema,
  documentResponseSchema,
  workspaceResponseSchema,
} from "@syncspace/shared";
import { verifyCollaborationToken } from "@syncspace/shared/collaboration-token";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  apiRequest,
  createTestApp,
  registerTestUser,
  resetDatabase,
  TEST_COLLABORATION_TOKEN_SECRET,
  type TestUser,
} from "../../test/test-app.js";

let app: FastifyInstance;
let database: PrismaClient;
let owner: TestUser;
let outsider: TestUser;
let slug: string;
let workspaceId: string;
let documentId: string;

beforeEach(async () => {
  ({ app, database } = createTestApp());
  await resetDatabase(database);
  owner = await registerTestUser(app, "Olivia Owner", "owner@example.com");
  outsider = await registerTestUser(app, "Oscar Outsider", "outsider@example.com");

  const workspace = workspaceResponseSchema.parse(
    (await apiRequest(app, "POST", "/workspaces", owner, { name: "Acme" })).json(),
  ).workspace;
  slug = workspace.slug;
  workspaceId = workspace.id;
  documentId = documentResponseSchema.parse(
    (await apiRequest(app, "POST", `/workspaces/${slug}/documents`, owner, {})).json(),
  ).document.id;
});

afterEach(async () => {
  await app.close();
});

async function addMember(role: WorkspaceRole): Promise<TestUser> {
  const user = await registerTestUser(app, `${role} User`, `${role.toLowerCase()}@example.com`);
  await database.workspaceMember.create({ data: { workspaceId, userId: user.id, role } });
  return user;
}

function requestToken(user?: TestUser, id = documentId) {
  return apiRequest(app, "POST", `/documents/${id}/collaboration-token`, user);
}

describe("POST /api/v1/documents/:id/collaboration-token", () => {
  it("issues a short-lived token bound to the user, their session and the document", async () => {
    const before = Date.now();

    const response = await requestToken(owner);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const { token, expiresAt } = collaborationTokenResponseSchema.parse(response.json());
    const payload = verifyCollaborationToken(token, TEST_COLLABORATION_TOKEN_SECRET);
    expect(payload).toMatchObject({ userId: owner.id, documentId });
    expect(await database.session.findUnique({ where: { id: payload?.sessionId } })).toMatchObject({
      userId: owner.id,
    });
    expect(Date.parse(expiresAt) - before).toBeLessThanOrEqual(61_000);
    // The token carries no role or permission claim.
    expect(Object.keys(payload ?? {}).sort()).toEqual(["documentId", "exp", "sessionId", "userId"]);
  });

  it("issues a token to a viewer, who may read", async () => {
    const viewer = await addMember("VIEWER");

    expect((await requestToken(viewer)).statusCode).toBe(200);
  });

  it("rejects requests without a session", async () => {
    expect((await requestToken()).statusCode).toBe(401);
  });

  it("answers 404 to a non-member and for deleted or unknown documents", async () => {
    expect((await requestToken(outsider)).statusCode).toBe(404);
    expect((await requestToken(owner, "00000000-0000-7000-8000-000000000000")).statusCode).toBe(404);

    await apiRequest(app, "DELETE", `/documents/${documentId}`, owner);
    expect((await requestToken(owner)).statusCode).toBe(404);
  });
});

describe("viewer role on the REST API", () => {
  it("lets a viewer read documents and folders, flagged as not editable", async () => {
    const viewer = await addMember("VIEWER");

    const list = await apiRequest(app, "GET", `/workspaces/${slug}/documents`, viewer);
    const detail = await apiRequest(app, "GET", `/documents/${documentId}`, viewer);
    const folders = await apiRequest(app, "GET", `/workspaces/${slug}/folders`, viewer);

    expect([list.statusCode, detail.statusCode, folders.statusCode]).toEqual([200, 200, 200]);
    expect(documentResponseSchema.parse(detail.json()).document.canEdit).toBe(false);
    expect(
      documentResponseSchema.parse((await apiRequest(app, "GET", `/documents/${documentId}`, owner)).json())
        .document.canEdit,
    ).toBe(true);
  });

  it("forbids a viewer from creating, renaming, moving or deleting", async () => {
    const viewer = await addMember("VIEWER");

    const responses = await Promise.all([
      apiRequest(app, "POST", `/workspaces/${slug}/documents`, viewer, {}),
      apiRequest(app, "POST", `/workspaces/${slug}/folders`, viewer, { name: "Nope" }),
      apiRequest(app, "PATCH", `/documents/${documentId}`, viewer, { title: "Nope" }),
      apiRequest(app, "PATCH", `/documents/${documentId}`, viewer, { folderId: null }),
      apiRequest(app, "DELETE", `/documents/${documentId}`, viewer),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([403, 403, 403, 403, 403]);
    expect(await database.document.count({ where: { deletedAt: null } })).toBe(1);
    expect(await database.folder.count()).toBe(0);
  });
});
