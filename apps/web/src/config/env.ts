import "server-only";

import { parseEnv } from "@syncspace/shared";
import { z } from "zod";

const serverEnvSchema = z.object({
  API_URL: z.url({ protocol: /^https?$/ }),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedEnv: ServerEnv | undefined;

/**
 * Server-only environment, validated on first use (at request time) so that
 * `next build` does not require runtime configuration.
 */
export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseEnv(serverEnvSchema, { API_URL: process.env.API_URL });
  return cachedEnv;
}
