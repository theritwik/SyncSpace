import type { PrismaClient } from "@syncspace/database";
import {
  apiErrorResponseSchema,
  documentListResponseSchema,
  documentResponseSchema,
  folderResponseSchema,
  workspaceResponseSchema,
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

let app: FastifyInstance;
let database: PrismaClient;
let owner: TestUser;
let outsider: TestUser;
/** Slug of a workspace owned by `owner`. */
let slug: string;
/** Slug of a workspace owned by `outsider`. */
let otherSlug: string;

beforeEach(async () => {
  ({ app, database } = createTestApp());
  await resetDatabase(database);
  owner = await registerTestUser(app, "Olivia Owner", "owner@example.com");
  outsider = await registerTestUser(app, "Oscar Outsider", "outsider@example.com");
  slug = await createWorkspace(owner, "Acme");
  otherSlug = await createWorkspace(outsider, "Other");
});

afterEach(async () => {
  await app.close();
});

async function createWorkspace(user: TestUser, name: string): Promise<string> {
  const response = await apiRequest(app, "POST", "/workspaces", user, { name });
  return workspaceResponseSchema.parse(response.json()).workspace.slug;
}

async function createFolder(user: TestUser, workspaceSlug: string, name: string, parentId?: string) {
  const response = await apiRequest(app, "POST", `/workspaces/${workspaceSlug}/folders`, user, {
    name,
    parentId,
  });
  expect(response.statusCode).toBe(201);
  return folderResponseSchema.parse(response.json()).folder;
}

async function createDocument(user: TestUser, workspaceSlug: string, payload: object = {}) {
  const response = await apiRequest(
    app,
    "POST",
    `/workspaces/${workspaceSlug}/documents`,
    user,
    payload,
  );
  expect(response.statusCode).toBe(201);
  return documentResponseSchema.parse(response.json()).document;
}

async function listDocuments(user: TestUser, workspaceSlug: string, query = "") {
  const response = await apiRequest(app, "GET", `/workspaces/${workspaceSlug}/documents${query}`, user);
  expect(response.statusCode).toBe(200);
  return documentListResponseSchema.parse(response.json()).documents;
}

function error(response: LightMyRequestResponse) {
  return apiErrorResponseSchema.parse(response.json()).error;
}

const MISSING_ID = "00000000-0000-7000-8000-000000000000";

describe("authentication", () => {
  it.each([
    ["GET", "/workspaces/acme/documents"],
    ["POST", "/workspaces/acme/documents"],
    ["GET", `/documents/${MISSING_ID}`],
    ["PATCH", `/documents/${MISSING_ID}`],
    ["DELETE", `/documents/${MISSING_ID}`],
  ] as const)("%s %s rejects requests without a session", async (method, path) => {
    const response = await apiRequest(app, method, path, undefined, method === "GET" ? undefined : {});

    expect(response.statusCode).toBe(401);
    expect(error(response).code).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/v1/workspaces/:slug/documents", () => {
  it("creates an untitled document at the top level by default", async () => {
    const response = await apiRequest(app, "POST", `/workspaces/${slug}/documents`, owner, {});

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    const { document } = documentResponseSchema.parse(response.json());
    expect(document).toMatchObject({
      title: "Untitled document",
      folderId: null,
      folderPath: [],
      createdBy: { id: owner.id, name: "Olivia Owner" },
      workspace: { slug, name: "Acme" },
    });
    expect(document.createdAt).toBe(document.updatedAt);
  });

  it("creates a titled document inside a folder and reports its folder path", async () => {
    const parent = await createFolder(owner, slug, "Projects");
    const child = await createFolder(owner, slug, "2026", parent.id);

    const document = await createDocument(owner, slug, { title: "  Roadmap ", folderId: child.id });

    expect(document).toMatchObject({ title: "Roadmap", folderId: child.id });
    expect(document.folderPath).toEqual([
      { id: parent.id, name: "Projects" },
      { id: child.id, name: "2026" },
    ]);
  });

  it("lets a plain member create documents", async () => {
    const member = await registerTestUser(app, "Mia Member", "member@example.com");
    const workspace = await database.workspace.findUniqueOrThrow({ where: { slug } });
    await database.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: member.id, role: "MEMBER" },
    });

    const document = await createDocument(member, slug, { title: "By a member" });

    expect(document.createdBy?.id).toBe(member.id);
  });

  it("rejects a folder that belongs to another workspace", async () => {
    const foreignFolder = await createFolder(outsider, otherSlug, "Theirs");

    const response = await apiRequest(app, "POST", `/workspaces/${slug}/documents`, owner, {
      folderId: foreignFolder.id,
    });

    expect(response.statusCode).toBe(400);
    expect(error(response).details).toEqual([
      { path: "folderId", message: "This folder does not exist in the workspace." },
    ]);
    expect(await database.document.count()).toBe(0);
  });

  it("rejects an invalid title", async () => {
    const empty = await apiRequest(app, "POST", `/workspaces/${slug}/documents`, owner, { title: " " });
    const tooLong = await apiRequest(app, "POST", `/workspaces/${slug}/documents`, owner, {
      title: "x".repeat(121),
    });

    expect(empty.statusCode).toBe(400);
    expect(tooLong.statusCode).toBe(400);
  });

  it("answers 404 to a non-member and creates nothing", async () => {
    const response = await apiRequest(app, "POST", `/workspaces/${slug}/documents`, outsider, {});

    expect(response.statusCode).toBe(404);
    expect(await database.document.count()).toBe(0);
  });
});

describe("GET /api/v1/workspaces/:slug/documents", () => {
  it("lists the workspace's documents, most recently updated first", async () => {
    const first = await createDocument(owner, slug, { title: "First" });
    const second = await createDocument(owner, slug, { title: "Second" });
    await createDocument(outsider, otherSlug, { title: "In another workspace" });
    // Renaming updates `updatedAt`, which moves the document to the top.
    await apiRequest(app, "PATCH", `/documents/${first.id}`, owner, { title: "First, renamed" });

    const documents = await listDocuments(owner, slug);

    expect(documents.map((document) => document.title)).toEqual(["First, renamed", "Second"]);
    expect(documents[1]?.id).toBe(second.id);
  });

  it("filters by folder and by top level, and honours the limit", async () => {
    const folder = await createFolder(owner, slug, "Projects");
    await createDocument(owner, slug, { title: "At top level" });
    await createDocument(owner, slug, { title: "In folder A", folderId: folder.id });
    await createDocument(owner, slug, { title: "In folder B", folderId: folder.id });

    expect((await listDocuments(owner, slug, "?folderId=root")).map((d) => d.title)).toEqual([
      "At top level",
    ]);
    expect((await listDocuments(owner, slug, `?folderId=${folder.id}`)).map((d) => d.title)).toEqual([
      "In folder B",
      "In folder A",
    ]);
    expect(await listDocuments(owner, slug, "?limit=2")).toHaveLength(2);
  });

  it("returns an empty list for an empty workspace", async () => {
    expect(await listDocuments(owner, slug)).toEqual([]);
  });

  it("rejects invalid query parameters", async () => {
    const response = await apiRequest(app, "GET", `/workspaces/${slug}/documents?limit=0`, owner);

    expect(response.statusCode).toBe(400);
  });

  it("answers 404 to a non-member", async () => {
    await createDocument(owner, slug);

    const response = await apiRequest(app, "GET", `/workspaces/${slug}/documents`, outsider);

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /api/v1/documents/:id", () => {
  it("returns the document with its workspace to a member", async () => {
    const created = await createDocument(owner, slug, { title: "Spec" });

    const response = await apiRequest(app, "GET", `/documents/${created.id}`, owner);

    expect(response.statusCode).toBe(200);
    expect(documentResponseSchema.parse(response.json()).document).toEqual(created);
  });

  it("answers 404 to a non-member, exactly as for a document that does not exist", async () => {
    const document = await createDocument(owner, slug);

    const forbidden = await apiRequest(app, "GET", `/documents/${document.id}`, outsider);
    const missing = await apiRequest(app, "GET", `/documents/${MISSING_ID}`, outsider);

    expect(forbidden.statusCode).toBe(404);
    expect(forbidden.json()).toEqual(missing.json());
  });

  it("rejects a malformed id", async () => {
    const response = await apiRequest(app, "GET", "/documents/not-a-uuid", owner);

    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /api/v1/documents/:id", () => {
  it("renames a document and updates its timestamp", async () => {
    const created = await createDocument(owner, slug, { title: "Draft" });

    const response = await apiRequest(app, "PATCH", `/documents/${created.id}`, owner, {
      title: "Final",
    });

    expect(response.statusCode).toBe(200);
    const { document } = documentResponseSchema.parse(response.json());
    expect(document.title).toBe("Final");
    expect(document.folderId).toBeNull();
    expect(Date.parse(document.updatedAt)).toBeGreaterThan(Date.parse(created.updatedAt));
    expect(document.createdAt).toBe(created.createdAt);
  });

  it("moves a document into a folder and back to the top level", async () => {
    const folder = await createFolder(owner, slug, "Projects");
    const created = await createDocument(owner, slug, { title: "Spec" });

    const moved = await apiRequest(app, "PATCH", `/documents/${created.id}`, owner, {
      folderId: folder.id,
    });
    expect(documentResponseSchema.parse(moved.json()).document).toMatchObject({
      title: "Spec",
      folderId: folder.id,
      folderPath: [{ id: folder.id, name: "Projects" }],
    });

    const movedBack = await apiRequest(app, "PATCH", `/documents/${created.id}`, owner, {
      folderId: null,
    });
    expect(documentResponseSchema.parse(movedBack.json()).document.folderId).toBeNull();
  });

  it("refuses to move a document into a folder of another workspace", async () => {
    const foreignFolder = await createFolder(outsider, otherSlug, "Theirs");
    const created = await createDocument(owner, slug);

    const response = await apiRequest(app, "PATCH", `/documents/${created.id}`, owner, {
      folderId: foreignFolder.id,
    });

    expect(response.statusCode).toBe(400);
    expect(error(response).details?.[0]?.path).toBe("folderId");
    expect((await database.document.findUniqueOrThrow({ where: { id: created.id } })).folderId).toBeNull();
  });

  it("rejects an empty update and an invalid title", async () => {
    const created = await createDocument(owner, slug);

    expect((await apiRequest(app, "PATCH", `/documents/${created.id}`, owner, {})).statusCode).toBe(400);
    expect(
      (await apiRequest(app, "PATCH", `/documents/${created.id}`, owner, { title: "" })).statusCode,
    ).toBe(400);
  });

  it("answers 404 to a non-member and changes nothing", async () => {
    const created = await createDocument(owner, slug, { title: "Private" });

    const response = await apiRequest(app, "PATCH", `/documents/${created.id}`, outsider, {
      title: "Hijacked",
    });

    expect(response.statusCode).toBe(404);
    expect((await database.document.findUniqueOrThrow({ where: { id: created.id } })).title).toBe(
      "Private",
    );
  });
});

describe("DELETE /api/v1/documents/:id", () => {
  it("soft-deletes: the row is kept but the document is gone from every endpoint", async () => {
    const created = await createDocument(owner, slug, { title: "Old notes" });
    const kept = await createDocument(owner, slug, { title: "Keep me" });

    const response = await apiRequest(app, "DELETE", `/documents/${created.id}`, owner);

    expect(response.statusCode).toBe(204);
    const row = await database.document.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.deletedAt).toBeInstanceOf(Date);
    expect(row.title).toBe("Old notes");

    expect((await listDocuments(owner, slug)).map((document) => document.id)).toEqual([kept.id]);
    expect((await apiRequest(app, "GET", `/documents/${created.id}`, owner)).statusCode).toBe(404);
    expect(
      (await apiRequest(app, "PATCH", `/documents/${created.id}`, owner, { title: "Back" })).statusCode,
    ).toBe(404);
    expect((await apiRequest(app, "DELETE", `/documents/${created.id}`, owner)).statusCode).toBe(404);
  });

  it("answers 404 to a non-member and deletes nothing", async () => {
    const created = await createDocument(owner, slug);

    const response = await apiRequest(app, "DELETE", `/documents/${created.id}`, outsider);

    expect(response.statusCode).toBe(404);
    expect((await database.document.findUniqueOrThrow({ where: { id: created.id } })).deletedAt).toBeNull();
  });
});

describe("access after membership changes", () => {
  it("revokes document access when the membership is removed", async () => {
    const member = await registerTestUser(app, "Mia Member", "member@example.com");
    const workspace = await database.workspace.findUniqueOrThrow({ where: { slug } });
    await database.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: member.id, role: "MEMBER" },
    });
    const document = await createDocument(owner, slug);
    expect((await apiRequest(app, "GET", `/documents/${document.id}`, member)).statusCode).toBe(200);

    await database.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: member.id } },
    });

    expect((await apiRequest(app, "GET", `/documents/${document.id}`, member)).statusCode).toBe(404);
  });
});
