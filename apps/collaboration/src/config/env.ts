import { parseEnv } from "@syncspace/shared";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  COLLABORATION_HOST: z.string().min(1).default("0.0.0.0"),
  COLLABORATION_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Shared with the API, which signs the connection tokens verified here.
  COLLABORATION_TOKEN_SECRET: z.string().min(32, "Must be at least 32 characters."),
  // How often open connections are checked against the database for a
  // revoked session, lost membership, changed role or deleted document.
  COLLABORATION_ACCESS_RECHECK_SECONDS: z.coerce.number().int().min(1).max(3600).default(30),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return parseEnv(envSchema, source);
}
