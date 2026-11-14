import { existsSync } from "node:fs";
import path from "node:path";

import type { NextConfig } from "next";

// The monorepo keeps a single .env at the repository root; Next.js only reads
// env files from the app directory, so load the root file here. Variables
// already present in the environment take precedence.
const rootEnvFile = path.resolve(import.meta.dirname, "../../.env");
if (existsSync(rootEnvFile)) {
  process.loadEnvFile(rootEnvFile);
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
