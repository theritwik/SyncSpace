import type { PrismaClient, WorkspaceRole } from "@syncspace/database";
import {
  apiErrorResponseSchema,
  authResponseSchema,
  SESSION_COOKIE_NAME,
  workspaceListResponseSchema,
  workspaceMembersResponseSchema,
  workspaceResponseSchema,
} from "@syncspace/shared";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetDatabase, TEST_WEB_ORIGIN } from "../../test/test-app.js";

// Integration tests: real Fastify app and real PostgreSQL (the `_test` database).
// Users sign up through the real registration route; the only shortcut is
// adding non-owner memberships directly in the database, because inviting
// members has no API yet.

type Cookies = Record<string, string>;
interface TestUser {
  id: string;
  cookies: Cookies;
}

let app: FastifyInstance;
let database: PrismaClient;
let owner: TestUser;
let outsider: TestUser;

beforeEach(async () => {
  ({ app, database } = createTestApp());
  await resetDatabase(database);
  owner = await registerUser("Olivia Owner", "owner@example.com");
  outsider = await registerUser("Oscar Outsider", "outsider@example.com");
});

afterEach(async () => {
  await app.close();
});

async function registerUser(name: string, email: string): Promise<TestUser> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: { origin: TEST_WEB_ORIGIN },
    payload: { name, email, password: "correct horse battery" },
  });
  const token = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)?.value;
  if (!token) throw new Error("Registration did not start a session");

  return {
    id: authResponseSchema.parse(response.json()).user.id,
    cookies: { [SESSION_COOKIE_NAME]: token },
  };
}

function request(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  user?: TestUser,
  payload?: object,
) {
  return app.inject({
    method,
    url: `/api/v1/workspaces${path}`,
    headers: method === "GET" ? {} : { origin: TEST_WEB_ORIGIN },
    cookies: user?.cookies,
    payload,
  });
}

async function createWorkspace(user: TestUser, name = "Acme Design") {
  const response = await request("POST", "", user, { name });
  expect(response.statusCode).toBe(201);
  return workspaceResponseSchema.parse(response.json()).workspace;
}

/** Registers a user and adds them to a workspace with the given role. */
async function addMember(workspaceId: string, role: WorkspaceRole): Promise<TestUser> {
  const user = await registerUser(`${role} User`, `${role.toLowerCase()}@example.com`);
  await database.workspaceMember.create({ data: { workspaceId, userId: user.id, role } });
  return user;
}

function errorCode(response: LightMyRequestResponse) {
  return apiErrorResponseSchema.parse(response.json()).error.code;
}

describe("authentication", () => {
  it.each([
    ["GET", ""],
    ["POST", ""],
    ["GET", "/some-workspace"],
    ["PATCH", "/some-workspace"],
    ["DELETE", "/some-workspace"],
    ["GET", "/some-workspace/members"],
  ] as const)("%s /workspaces%s rejects requests without a session", async (method, path) => {
    const response = await request(method, path, undefined, method === "GET" ? undefined : {});

    expect(response.statusCode).toBe(401);
    expect(errorCode(response)).toBe("UNAUTHENTICATED");
  });
});

describe("POST /api/v1/workspaces", () => {
  it("creates the workspace and makes the creator its owner", async () => {
    const response = await request("POST", "", owner, { name: "  Acme Design " });

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    const { workspace } = workspaceResponseSchema.parse(response.json());
    expect(workspace).toMatchObject({ name: "Acme Design", role: "OWNER", memberCount: 1 });
    expect(workspace.slug).toMatch(/^acme-design-[a-z0-9]{6}$/);

    const members = await database.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
    });
    expect(members).toEqual([expect.objectContaining({ userId: owner.id, role: "OWNER" })]);
  });

  it("gives workspaces with the same name distinct slugs", async () => {
    const first = await createWorkspace(owner, "Team");
    const second = await createWorkspace(outsider, "Team");

    expect(first.slug).not.toBe(second.slug);
  });

  it("rejects an empty or too long name and creates nothing", async () => {
    const empty = await request("POST", "", owner, { name: "   " });
    const tooLong = await request("POST", "", owner, { name: "x".repeat(61) });

    expect(empty.statusCode).toBe(400);
    expect(tooLong.statusCode).toBe(400);
    expect(errorCode(empty)).toBe("VALIDATION_ERROR");
    expect(await database.workspace.count()).toBe(0);
  });

  it("rejects requests from another origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/workspaces",
      headers: { origin: "https://evil.example" },
      cookies: owner.cookies,
      payload: { name: "Injected" },
    });

    expect(response.statusCode).toBe(403);
    expect(await database.workspace.count()).toBe(0);
  });
});

describe("GET /api/v1/workspaces", () => {
  it("lists only the workspaces the user belongs to, with their own role", async () => {
    const owned = await createWorkspace(owner, "Owned");
    const shared = await createWorkspace(outsider, "Shared");
    await createWorkspace(outsider, "Private to someone else");
    await database.workspaceMember.create({
      data: { workspaceId: shared.id, userId: owner.id, role: "MEMBER" },
    });

    const response = await request("GET", "", owner);

    expect(response.statusCode).toBe(200);
    const { workspaces } = workspaceListResponseSchema.parse(response.json());
    expect(workspaces.map(({ id, role, memberCount }) => ({ id, role, memberCount }))).toEqual([
      { id: owned.id, role: "OWNER", memberCount: 1 },
      { id: shared.id, role: "MEMBER", memberCount: 2 },
    ]);
  });

  it("returns an empty list for a user without workspaces", async () => {
    await createWorkspace(owner);

    const response = await request("GET", "", outsider);

    expect(workspaceListResponseSchema.parse(response.json()).workspaces).toEqual([]);
  });
});

describe("GET /api/v1/workspaces/:slug", () => {
  it("returns the workspace to a member, with that member's role", async () => {
    const workspace = await createWorkspace(owner);
    const member = await addMember(workspace.id, "MEMBER");

    const response = await request("GET", `/${workspace.slug}`, member);

    expect(response.statusCode).toBe(200);
    expect(workspaceResponseSchema.parse(response.json()).workspace).toMatchObject({
      id: workspace.id,
      role: "MEMBER",
      memberCount: 2,
    });
  });

  it("answers 404 to a non-member, exactly as for a workspace that does not exist", async () => {
    const workspace = await createWorkspace(owner);

    const forbidden = await request("GET", `/${workspace.slug}`, outsider);
    const missing = await request("GET", "/does-not-exist", outsider);

    expect(forbidden.statusCode).toBe(404);
    expect(forbidden.json()).toEqual(missing.json());
  });

  it("rejects a malformed slug", async () => {
    const response = await request("GET", "/Not_A_Slug!", owner);

    expect(response.statusCode).toBe(400);
  });
});

describe("PATCH /api/v1/workspaces/:slug", () => {
  it("lets the owner rename the workspace without changing its slug", async () => {
    const workspace = await createWorkspace(owner);

    const response = await request("PATCH", `/${workspace.slug}`, owner, { name: "Renamed" });

    expect(response.statusCode).toBe(200);
    expect(workspaceResponseSchema.parse(response.json()).workspace).toMatchObject({
      name: "Renamed",
      slug: workspace.slug,
      role: "OWNER",
    });
    expect((await database.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).name).toBe(
      "Renamed",
    );
  });

  it("lets an admin rename the workspace", async () => {
    const workspace = await createWorkspace(owner);
    const admin = await addMember(workspace.id, "ADMIN");

    const response = await request("PATCH", `/${workspace.slug}`, admin, { name: "By admin" });

    expect(response.statusCode).toBe(200);
  });

  it("forbids a plain member from renaming", async () => {
    const workspace = await createWorkspace(owner);
    const member = await addMember(workspace.id, "MEMBER");

    const response = await request("PATCH", `/${workspace.slug}`, member, { name: "Hijacked" });

    expect(response.statusCode).toBe(403);
    expect(errorCode(response)).toBe("FORBIDDEN");
    expect((await database.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).name).toBe(
      "Acme Design",
    );
  });

  it("answers 404 to a non-member and changes nothing", async () => {
    const workspace = await createWorkspace(owner);

    const response = await request("PATCH", `/${workspace.slug}`, outsider, { name: "Hijacked" });

    expect(response.statusCode).toBe(404);
    expect((await database.workspace.findUniqueOrThrow({ where: { id: workspace.id } })).name).toBe(
      "Acme Design",
    );
  });

  it("rejects an invalid name", async () => {
    const workspace = await createWorkspace(owner);

    const response = await request("PATCH", `/${workspace.slug}`, owner, { name: "" });

    expect(response.statusCode).toBe(400);
  });
});

describe("DELETE /api/v1/workspaces/:slug", () => {
  it("lets the owner delete the workspace together with its memberships", async () => {
    const workspace = await createWorkspace(owner);
    await addMember(workspace.id, "MEMBER");

    const response = await request("DELETE", `/${workspace.slug}`, owner);

    expect(response.statusCode).toBe(204);
    expect(await database.workspace.count()).toBe(0);
    expect(await database.workspaceMember.count()).toBe(0);
    expect((await request("GET", `/${workspace.slug}`, owner)).statusCode).toBe(404);
  });

  it.each(["ADMIN", "MEMBER"] as const)("forbids a %s from deleting", async (role) => {
    const workspace = await createWorkspace(owner);
    const member = await addMember(workspace.id, role);

    const response = await request("DELETE", `/${workspace.slug}`, member);

    expect(response.statusCode).toBe(403);
    expect(await database.workspace.count()).toBe(1);
  });

  it("answers 404 to a non-member and deletes nothing", async () => {
    const workspace = await createWorkspace(owner);

    const response = await request("DELETE", `/${workspace.slug}`, outsider);

    expect(response.statusCode).toBe(404);
    expect(await database.workspace.count()).toBe(1);
  });

  it("only deletes the targeted workspace", async () => {
    const first = await createWorkspace(owner, "First");
    const second = await createWorkspace(owner, "Second");

    await request("DELETE", `/${first.slug}`, owner);

    expect((await request("GET", `/${second.slug}`, owner)).statusCode).toBe(200);
  });
});

describe("GET /api/v1/workspaces/:slug/members", () => {
  it("lists members with their roles, without any credential fields", async () => {
    const workspace = await createWorkspace(owner);
    const member = await addMember(workspace.id, "MEMBER");

    const response = await request("GET", `/${workspace.slug}/members`, member);

    expect(response.statusCode).toBe(200);
    const { members } = workspaceMembersResponseSchema.parse(response.json());
    expect(members.map(({ userId, role }) => ({ userId, role }))).toEqual([
      { userId: owner.id, role: "OWNER" },
      { userId: member.id, role: "MEMBER" },
    ]);
    expect(response.body).not.toMatch(/password/i);
  });

  it("answers 404 to a non-member", async () => {
    const workspace = await createWorkspace(owner);

    const response = await request("GET", `/${workspace.slug}/members`, outsider);

    expect(response.statusCode).toBe(404);
  });
});

describe("access after membership changes", () => {
  it("revokes access as soon as the membership is removed", async () => {
    const workspace = await createWorkspace(owner);
    const member = await addMember(workspace.id, "MEMBER");
    expect((await request("GET", `/${workspace.slug}`, member)).statusCode).toBe(200);

    await database.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId: member.id } },
    });

    expect((await request("GET", `/${workspace.slug}`, member)).statusCode).toBe(404);
    expect(workspaceListResponseSchema.parse((await request("GET", "", member)).json()).workspaces).toEqual([]);
  });
});
