import { existsSync } from "node:fs";
import path from "node:path";

// Tooling entry points (Prisma CLI, Vitest) run from this package, but the
// single .env file lives at the repository root. Variables that are already
// set (for example in CI) take precedence over the file.
const rootEnvFile = path.resolve(import.meta.dirname, "../../.env");

if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}
