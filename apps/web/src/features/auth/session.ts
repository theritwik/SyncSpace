import "server-only";

import { authResponseSchema, SESSION_COOKIE_NAME, type PublicUser } from "@syncspace/shared";
import { cookies } from "next/headers";
import { cache } from "react";

import { getServerEnv } from "@/config/env";

const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Returns the signed-in user, or null.
 *
 * The web app does not decide by itself whether a session is valid: it
 * forwards the browser's session cookie to the API (`GET /auth/me`), which
 * looks the session up in the database. `cache` makes several components in
 * one render share a single API call.
 */
export const getCurrentUser = cache(async (): Promise<PublicUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const response = await fetch(new URL("/api/v1/auth/me", getServerEnv().API_URL), {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 401) return null;
  if (!response.ok) {
    throw new Error(`Session check failed with status ${response.status}`);
  }

  return authResponseSchema.parse(await response.json()).user;
});
