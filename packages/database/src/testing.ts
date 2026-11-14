import { execFileSync } from "node:child_process";
import path from "node:path";

import { createDatabaseClient } from "./client.js";

const packageRoot = path.resolve(import.meta.dirname, "..");

/**
 * Prepares a dedicated database for integration tests and returns its URL.
 *
 * The test database is the configured one with a `_test` suffix
 * (`syncspace` -> `syncspace_test`). It is created if missing and brought up
 * to date with `prisma migrate deploy`, so tests can freely insert and delete
 * rows without touching development data.
 */
export async function setupTestDatabase(
  databaseUrl: string | undefined = process.env.DATABASE_URL,
): Promise<string> {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL must be set to run database integration tests.");
  }

  const testUrl = new URL(databaseUrl);
  const testDatabaseName = `${testUrl.pathname.slice(1)}_test`;
  // The name is interpolated into CREATE DATABASE below (identifiers cannot be
  // query parameters), so only plain identifiers are accepted.
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(testDatabaseName)) {
    throw new Error(`Refusing to use unsafe test database name "${testDatabaseName}".`);
  }
  testUrl.pathname = `/${testDatabaseName}`;

  const admin = createDatabaseClient(databaseUrl);
  try {
    const existing = await admin.$queryRaw<unknown[]>`
      SELECT 1 FROM pg_database WHERE datname = ${testDatabaseName}
    `;
    if (existing.length === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${testDatabaseName}"`);
    }
  } finally {
    await admin.$disconnect();
  }

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: packageRoot,
    env: { ...process.env, DATABASE_URL: testUrl.toString() },
    stdio: "pipe",
  });

  return testUrl.toString();
}
