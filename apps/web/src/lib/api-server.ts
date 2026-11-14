import "server-only";

import { SESSION_COOKIE_NAME } from "@syncspace/shared";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { z } from "zod";

import { getServerEnv } from "@/config/env";

const REQUEST_TIMEOUT_MS = 5_000;

/**
 * Loads data from the API while rendering on the server, on behalf of the
 * signed-in user: the browser's session cookie is forwarded, and the API
 * decides what this user may see.
 *
 * - no or invalid session -> redirect to the login page
 * - 404 -> `null` (the caller decides how to present "not found")
 * - any other failure -> throws, which shows the nearest error boundary
 */
export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T | null> {
  const token = (await cookies()).get(SESSION_COOKIE_NAME)?.value;
  if (!token) redirect("/login");

  const response = await fetch(new URL(`/api/v1${path}`, getServerEnv().API_URL), {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}` },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 401) redirect("/login");
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`API request to ${path} failed with status ${response.status}`);
  }

  return schema.parse(await response.json());
}
