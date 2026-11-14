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

const collaborationEnvSchema = z.object({
  COLLABORATION_URL: z.url({ protocol: /^wss?$/ }),
});

let cachedCollaborationUrl: string | undefined;

/**
 * WebSocket URL of the collaboration service as the browser must reach it.
 * Read on the server at request time and handed to the editor, so it is
 * runtime configuration rather than something baked into the build.
 */
export function getCollaborationUrl(): string {
  cachedCollaborationUrl ??= parseEnv(collaborationEnvSchema, {
    COLLABORATION_URL: process.env.COLLABORATION_URL,
  }).COLLABORATION_URL;
  return cachedCollaborationUrl;
}
