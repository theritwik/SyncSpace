import { parseEnv } from "@syncspace/shared";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  COLLABORATION_HOST: z.string().min(1).default("0.0.0.0"),
  COLLABORATION_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return parseEnv(envSchema, source);
}
