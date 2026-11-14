import type { TestProject } from "vitest/node";

import { setupTestDatabase } from "./testing.js";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

/** Runs once before all test files: creates and migrates the `_test` database. */
export default async function setup(project: TestProject): Promise<void> {
  project.provide("testDatabaseUrl", await setupTestDatabase());
}
