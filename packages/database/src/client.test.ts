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
