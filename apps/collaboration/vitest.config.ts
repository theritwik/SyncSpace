import { existsSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "vitest/config";

// DATABASE_URL comes from the repository-root .env locally and from real
// environment variables in CI (which take precedence).
const rootEnvFile = path.resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    globalSetup: ["src/test/global-setup.ts"],
    // Test files share one database and reset its tables.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
