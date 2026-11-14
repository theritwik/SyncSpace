import { setupTestDatabase } from "@syncspace/database/testing";
import type { TestProject } from "vitest/node";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

/** Runs once before all test files: creates and migrates the `_test` database. */
export default async function setup(project: TestProject): Promise<void> {
  project.provide("testDatabaseUrl", await setupTestDatabase());
}
