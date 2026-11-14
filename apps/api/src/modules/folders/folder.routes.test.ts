import type { PrismaClient } from "@syncspace/database";
import {
  apiErrorResponseSchema,
  folderListResponseSchema,
  folderResponseSchema,
  MAX_FOLDER_DEPTH,
  workspaceResponseSchema,
} from "@syncspace/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  apiRequest,
  createTestApp,
  registerTestUser,
  resetDatabase,
  type TestUser,
} from "../../test/test-app.js";

let app: FastifyInstance;
let database: PrismaClient;
let owner: TestUser;
let outsider: TestUser;
let slug: string;
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

function postFolder(user: TestUser | undefined, workspaceSlug: string, payload: object) {
  return apiRequest(app, "POST", `/workspaces/${workspaceSlug}/folders`, user, payload);
}

async function createFolder(user: TestUser, workspaceSlug: string, name: string, parentId?: string) {
  const response = await postFolder(user, workspaceSlug, { name, parentId });
  expect(response.statusCode).toBe(201);
  return folderResponseSchema.parse(response.json()).folder;
}

describe("POST /api/v1/workspaces/:slug/folders", () => {
  it("creates a top-level folder", async () => {
    const response = await postFolder(owner, slug, { name: "  Projects " });

    expect(response.statusCode).toBe(201);
    const { folder } = folderResponseSchema.parse(response.json());
    expect(folder).toMatchObject({ name: "Projects", parentId: null });
    expect((await database.folder.findUniqueOrThrow({ where: { id: folder.id } })).createdById).toBe(
      owner.id,
    );
  });

  it("creates a nested folder", async () => {
    const parent = await createFolder(owner, slug, "Projects");

    const child = await createFolder(owner, slug, "2026", parent.id);

    expect(child.parentId).toBe(parent.id);
    expect(child.workspaceId).toBe(parent.workspaceId);
  });

  it("rejects a parent folder that belongs to another workspace", async () => {
    const foreignFolder = await createFolder(outsider, otherSlug, "Theirs");

    const response = await postFolder(owner, slug, { name: "Sneaky", parentId: foreignFolder.id });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.details).toEqual([
      { path: "parentId", message: "This folder does not exist in the workspace." },
    ]);
    expect(await database.folder.count()).toBe(1);
  });

  it("rejects a parent folder that does not exist", async () => {
    const response = await postFolder(owner, slug, {
      name: "Orphan",
      parentId: "00000000-0000-7000-8000-000000000000",
    });

    expect(response.statusCode).toBe(400);
  });

  it(`rejects nesting deeper than ${MAX_FOLDER_DEPTH} levels`, async () => {
    let parentId: string | undefined;
    for (let level = 1; level <= MAX_FOLDER_DEPTH; level++) {
      parentId = (await createFolder(owner, slug, `Level ${level}`, parentId)).id;
    }

    const response = await postFolder(owner, slug, { name: "Too deep", parentId });

    expect(response.statusCode).toBe(400);
    expect(apiErrorResponseSchema.parse(response.json()).error.details?.[0]?.message).toMatch(
      /at most 5 levels/,
    );
    expect(await database.folder.count()).toBe(MAX_FOLDER_DEPTH);
  });

  it("rejects an empty or too long name and a malformed parent id", async () => {
    expect((await postFolder(owner, slug, { name: " " })).statusCode).toBe(400);
    expect((await postFolder(owner, slug, { name: "x".repeat(61) })).statusCode).toBe(400);
    expect((await postFolder(owner, slug, { name: "Ok", parentId: "nope" })).statusCode).toBe(400);
    expect(await database.folder.count()).toBe(0);
  });

  it("rejects requests without a session and from non-members", async () => {
    expect((await postFolder(undefined, slug, { name: "Anonymous" })).statusCode).toBe(401);
    expect((await postFolder(outsider, slug, { name: "Intruder" })).statusCode).toBe(404);
    expect(await database.folder.count()).toBe(0);
  });
});

describe("GET /api/v1/workspaces/:slug/folders", () => {
  it("lists only the folders of that workspace", async () => {
    const parent = await createFolder(owner, slug, "Projects");
    await createFolder(owner, slug, "Archive");
    await createFolder(owner, slug, "2026", parent.id);
    await createFolder(outsider, otherSlug, "Theirs");

    const response = await apiRequest(app, "GET", `/workspaces/${slug}/folders`, owner);

    expect(response.statusCode).toBe(200);
    const { folders } = folderListResponseSchema.parse(response.json());
    expect(folders.map((folder) => folder.name)).toEqual(["2026", "Archive", "Projects"]);
  });

  it("rejects requests without a session and from non-members", async () => {
    expect((await apiRequest(app, "GET", `/workspaces/${slug}/folders`)).statusCode).toBe(401);
    expect((await apiRequest(app, "GET", `/workspaces/${slug}/folders`, outsider)).statusCode).toBe(404);
  });
});
