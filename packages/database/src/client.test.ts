import { afterAll, beforeEach, describe, expect, inject, it } from "vitest";

import { checkDatabaseConnection, createDatabaseClient, isUniqueConstraintError } from "./client.js";

// Integration tests against the real PostgreSQL instance from
// docker-compose.yml (or CI's service container), using the `_test` database.
const client = createDatabaseClient(inject("testDatabaseUrl"));

afterAll(async () => {
  await client.$disconnect();
});

describe("database connection", () => {
  it("connects to PostgreSQL and runs a query", async () => {
    await expect(checkDatabaseConnection(client)).resolves.toBeUndefined();
  });

  it("rejects when the database is unreachable", async () => {
    const unreachable = createDatabaseClient("postgresql://user:pass@127.0.0.1:1/none");

    await expect(checkDatabaseConnection(unreachable)).rejects.toThrow();
    await unreachable.$disconnect();
  });
});

describe("users and sessions schema", () => {
  const userData = { name: "Grace Hopper", email: "grace@example.com", passwordHash: "test-hash" };

  beforeEach(async () => {
    await client.workspace.deleteMany();
    await client.user.deleteMany();
  });

  it("generates ids and timestamps for a new user", async () => {
    const user = await client.user.create({ data: userData });

    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.createdAt).toBeInstanceOf(Date);
    expect(user.updatedAt).toBeInstanceOf(Date);
  });

  it("enforces unique emails and reports the violation as a unique-constraint error", async () => {
    await client.user.create({ data: userData });

    const duplicate = await client.user.create({ data: userData }).catch((error: unknown) => error);

    expect(isUniqueConstraintError(duplicate)).toBe(true);
    expect(isUniqueConstraintError(new Error("something else"))).toBe(false);
  });

  it("enforces unique session token hashes", async () => {
    const user = await client.user.create({ data: userData });
    const sessionData = { tokenHash: "hash-1", userId: user.id, expiresAt: new Date() };
    await client.session.create({ data: sessionData });

    const duplicate = await client.session.create({ data: sessionData }).catch((error: unknown) => error);

    expect(isUniqueConstraintError(duplicate)).toBe(true);
  });

  it("deletes a user's sessions when the user is deleted", async () => {
    const user = await client.user.create({ data: userData });
    await client.session.create({
      data: { tokenHash: "hash-1", userId: user.id, expiresAt: new Date() },
    });

    await client.user.delete({ where: { id: user.id } });

    expect(await client.session.count()).toBe(0);
  });

  it("rejects a session that references a missing user", async () => {
    await expect(
      client.session.create({
        data: {
          tokenHash: "hash-1",
          userId: "00000000-0000-7000-8000-000000000000",
          expiresAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe("workspaces schema", () => {
  const userData = { name: "Grace Hopper", email: "grace@example.com", passwordHash: "test-hash" };

  beforeEach(async () => {
    await client.workspace.deleteMany();
    await client.user.deleteMany();
  });

  it("allows a user to be a member of a workspace only once", async () => {
    const user = await client.user.create({ data: userData });
    const workspace = await client.workspace.create({ data: { name: "Team", slug: "team-1" } });
    const membership = { workspaceId: workspace.id, userId: user.id };
    await client.workspaceMember.create({ data: { ...membership, role: "OWNER" } });

    const duplicate = await client.workspaceMember
      .create({ data: { ...membership, role: "MEMBER" } })
      .catch((error: unknown) => error);

    expect(isUniqueConstraintError(duplicate)).toBe(true);
  });

  it("enforces unique slugs", async () => {
    await client.workspace.create({ data: { name: "Team", slug: "team-1" } });

    const duplicate = await client.workspace
      .create({ data: { name: "Other", slug: "team-1" } })
      .catch((error: unknown) => error);

    expect(isUniqueConstraintError(duplicate)).toBe(true);
  });

  it("removes memberships when a workspace or a user is deleted", async () => {
    const user = await client.user.create({ data: userData });
    const first = await client.workspace.create({ data: { name: "First", slug: "first-1" } });
    const second = await client.workspace.create({ data: { name: "Second", slug: "second-1" } });
    await client.workspaceMember.createMany({
      data: [
        { workspaceId: first.id, userId: user.id, role: "OWNER" },
        { workspaceId: second.id, userId: user.id, role: "MEMBER" },
      ],
    });

    await client.workspace.delete({ where: { id: first.id } });
    expect(await client.workspaceMember.count()).toBe(1);

    await client.user.delete({ where: { id: user.id } });
    expect(await client.workspaceMember.count()).toBe(0);
  });

  it("rolls back the workspace when creating its owner membership fails", async () => {
    const create = client.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({ data: { name: "Team", slug: "team-1" } });
      // No such user: the foreign key rejects this insert.
      await tx.workspaceMember.create({
        data: {
          workspaceId: workspace.id,
          userId: "00000000-0000-7000-8000-000000000000",
          role: "OWNER",
        },
      });
    });

    await expect(create).rejects.toThrow();
    expect(await client.workspace.count()).toBe(0);
  });
});

describe("folders and documents schema", () => {
  const MISSING_ID = "00000000-0000-7000-8000-000000000000";

  beforeEach(async () => {
    await client.workspace.deleteMany();
    await client.user.deleteMany();
  });

  async function createWorkspace(slug: string) {
    return client.workspace.create({ data: { name: slug, slug } });
  }

  it("refuses a document in a folder of another workspace", async () => {
    const first = await createWorkspace("first");
    const second = await createWorkspace("second");
    const folderInSecond = await client.folder.create({
      data: { name: "Theirs", workspaceId: second.id },
    });

    // The composite foreign key (folder_id, workspace_id) has no matching folder row.
    await expect(
      client.document.create({
        data: { title: "Misplaced", workspaceId: first.id, folderId: folderInSecond.id },
      }),
    ).rejects.toThrow();
    expect(await client.document.count()).toBe(0);
  });

  it("refuses a folder whose parent is in another workspace, missing, or itself", async () => {
    const first = await createWorkspace("first");
    const second = await createWorkspace("second");
    const folderInSecond = await client.folder.create({
      data: { name: "Theirs", workspaceId: second.id },
    });
    const folder = await client.folder.create({ data: { name: "Mine", workspaceId: first.id } });

    await expect(
      client.folder.create({
        data: { name: "Cross", workspaceId: first.id, parentId: folderInSecond.id },
      }),
    ).rejects.toThrow();
    await expect(
      client.folder.create({ data: { name: "Orphan", workspaceId: first.id, parentId: MISSING_ID } }),
    ).rejects.toThrow();
    // CHECK constraint folders_not_own_parent.
    await expect(
      client.folder.update({ where: { id: folder.id }, data: { parentId: folder.id } }),
    ).rejects.toThrow();
  });

  it("refuses folders and documents without an existing workspace", async () => {
    await expect(
      client.folder.create({ data: { name: "Nowhere", workspaceId: MISSING_ID } }),
    ).rejects.toThrow();
    await expect(
      client.document.create({ data: { title: "Nowhere", workspaceId: MISSING_ID } }),
    ).rejects.toThrow();
  });

  it("removes folders and documents (including soft-deleted ones) with their workspace", async () => {
    const workspace = await createWorkspace("first");
    const other = await createWorkspace("second");
    const parent = await client.folder.create({ data: { name: "Parent", workspaceId: workspace.id } });
    const child = await client.folder.create({
      data: { name: "Child", workspaceId: workspace.id, parentId: parent.id },
    });
    await client.document.createMany({
      data: [
        { title: "Top level", workspaceId: workspace.id },
        { title: "Nested", workspaceId: workspace.id, folderId: child.id },
        { title: "Deleted", workspaceId: workspace.id, deletedAt: new Date() },
        { title: "Unrelated", workspaceId: other.id },
      ],
    });

    await client.workspace.delete({ where: { id: workspace.id } });

    expect(await client.folder.count()).toBe(0);
    expect((await client.document.findMany()).map((document) => document.title)).toEqual([
      "Unrelated",
    ]);
  });

  it("keeps folders and documents when their creator is deleted", async () => {
    const user = await client.user.create({
      data: { name: "Grace Hopper", email: "grace@example.com", passwordHash: "test-hash" },
    });
    const workspace = await createWorkspace("first");
    const folder = await client.folder.create({
      data: { name: "Folder", workspaceId: workspace.id, createdById: user.id },
    });
    const document = await client.document.create({
      data: { title: "Doc", workspaceId: workspace.id, folderId: folder.id, createdById: user.id },
    });

    await client.user.delete({ where: { id: user.id } });

    expect((await client.folder.findUniqueOrThrow({ where: { id: folder.id } })).createdById).toBeNull();
    expect(
      (await client.document.findUniqueOrThrow({ where: { id: document.id } })).createdById,
    ).toBeNull();
  });
});
