import { createDatabaseClient, type PrismaClient } from "@syncspace/database";
import type { FastifyInstance } from "fastify";
import { inject } from "vitest";

import { buildApp, type AppConfig, type AppOptions } from "../app.js";

export const TEST_WEB_ORIGIN = "http://localhost:3000";

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
  // Sessions are removed with their users (ON DELETE CASCADE).
  await database.user.deleteMany();
}
