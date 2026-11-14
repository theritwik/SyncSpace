import "server-only";

import { apiHealthResponseSchema, type ApiHealthResponse } from "@syncspace/shared";

import { getServerEnv } from "@/config/env";

const REQUEST_TIMEOUT_MS = 3_000;

export type ApiHealthResult =
  | { reachable: true; health: ApiHealthResponse }
  | { reachable: false };

/** Fetches the API health endpoint. Never cached: it reflects the current state. */
export async function getApiHealth(): Promise<ApiHealthResult> {
  const { API_URL } = getServerEnv();

  try {
    const response = await fetch(new URL("/api/v1/health", API_URL), {
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    // The API answers 503 with the same body shape when a dependency is down,
    // so the body is parsed regardless of the status code.
    const health = apiHealthResponseSchema.parse(await response.json());
    return { reachable: true, health };
  } catch {
    return { reachable: false };
  }
}
