import { afterAll, describe, expect, it } from "vitest";

import { checkDatabaseConnection, createDatabaseClient } from "./client.js";

// Integration tests: they need the PostgreSQL instance from docker-compose.yml
// (or CI's service container) to be running and reachable via DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set to run the database integration tests.");
}

describe("database client", () => {
  const client = createDatabaseClient(databaseUrl);

  afterAll(async () => {
    await client.$disconnect();
  });

  it("connects to PostgreSQL and runs a query", async () => {
    await expect(checkDatabaseConnection(client)).resolves.toBeUndefined();
  });

  it("rejects when the database is unreachable", async () => {
    const unreachable = createDatabaseClient("postgresql://user:pass@127.0.0.1:1/none");

    await expect(checkDatabaseConnection(unreachable)).rejects.toThrow();
    await unreachable.$disconnect();
  });
});
