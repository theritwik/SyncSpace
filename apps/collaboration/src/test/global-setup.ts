import { setupTestDatabase } from "@syncspace/database/testing";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

/**
 * Runs once before all test files. The collaboration tests get their own
 * database because they run at the same time as the API's tests.
 */
export default async function setup(project: TestProject): Promise<void> {
  project.provide(
    "testDatabaseUrl",
    await setupTestDatabase(process.env.DATABASE_URL, "test_collaboration"),
  );
}
