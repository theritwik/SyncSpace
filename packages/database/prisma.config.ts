import "./load-root-env.ts";

import { defineConfig } from "prisma/config";

// `prisma generate` does not need a database, so DATABASE_URL is only passed
// through when present. Commands that do need it (migrate, studio) fail with
// Prisma's own "datasource.url is required" error when it is missing.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
