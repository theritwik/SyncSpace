import { createDatabaseClient, type PrismaClient } from "@syncspace/database";
import { authResponseSchema, SESSION_COOKIE_NAME } from "@syncspace/shared";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { inject } from "vitest";

import { buildApp, type AppConfig, type AppOptions } from "../app.js";

export const TEST_WEB_ORIGIN = "http://localhost:3000";
export const TEST_COLLABORATION_TOKEN_SECRET = "test-secret-test-secret-test-secret-1234";

interface TestAppOverrides {
  config?: Partial<AppConfig>;
  checkDatabase?: AppOptions["checkDatabase"];
}

/** Builds the real app wired to the test database. Nothing is mocked by default. */
export function createTestApp(overrides: TestAppOverrides = {}): {
  app: FastifyInstance;
  database: PrismaClient;
} {
  const database = createDatabaseClient(inject("testDatabaseUrl"));
  const app = buildApp({
    database,
    checkDatabase: overrides.checkDatabase,
    config: {
      webOrigin: TEST_WEB_ORIGIN,
      secureCookies: false,
      sessionTtlDays: 7,
      trustProxy: false,
      collaborationTokenSecret: TEST_COLLABORATION_TOKEN_SECRET,
      ...overrides.config,
      // High limits by default so ordinary tests never trip the rate limiter.
      rateLimits: {
        loginPerIp: { max: 1000, windowMs: 60_000 },
        loginFailuresPerAccount: { max: 1000, windowMs: 60_000 },
        registerPerIp: { max: 1000, windowMs: 60_000 },
        ...overrides.config?.rateLimits,
      },
    },
  });
  app.addHook("onClose", async () => {
    await database.$disconnect();
  });

  return { app, database };
}

export async function resetDatabase(database: PrismaClient): Promise<void> {
  // Memberships and sessions are removed with their parents (ON DELETE CASCADE).
  await database.workspace.deleteMany();
  await database.user.deleteMany();
}

export interface TestUser {
  id: string;
  cookies: Record<string, string>;
}

/** Signs a user up through the real registration route and returns their session cookie. */
export async function registerTestUser(
  app: FastifyInstance,
  name: string,
  email: string,
): Promise<TestUser> {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/register",
    headers: { origin: TEST_WEB_ORIGIN },
    payload: { name, email, password: "correct horse battery" },
  });
  const token = response.cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME)?.value;
  if (response.statusCode !== 201 || !token) {
    throw new Error(`Test user registration failed with status ${response.statusCode}`);
  }

  return {
    id: authResponseSchema.parse(response.json()).user.id,
    cookies: { [SESSION_COOKIE_NAME]: token },
  };
}

/** Sends an in-process request the way a browser would (Origin header on writes). */
export function apiRequest(
  app: FastifyInstance,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  user?: TestUser,
  payload?: object,
): Promise<LightMyRequestResponse> {
  return app.inject({
    method,
    url: `/api/v1${path}`,
    headers: method === "GET" ? {} : { origin: TEST_WEB_ORIGIN },
    cookies: user?.cookies,
    payload,
  });
}
