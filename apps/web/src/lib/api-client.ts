import { apiErrorResponseSchema, type ApiErrorCode } from "@syncspace/shared";
import type { z } from "zod";

export type FieldErrors = Record<string, string>;

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ApiErrorCode | "NETWORK_ERROR"; message: string; fieldErrors: FieldErrors };

interface ApiRequestOptions<T> {
  body?: unknown;
  /** Validates and types the response body. Omit for responses without a body. */
  schema?: z.ZodType<T>;
}

/**
 * Sends a request from the browser to `/api/v1/*` on the web app's own origin
 * (forwarded to the API by `proxy.ts`). The session travels in an HttpOnly
 * cookie that the browser attaches by itself; this code never sees it.
 *
 * It never throws: callers get either the data or a message that is safe to show.
 */
export async function apiRequest<T = undefined>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  { body, schema }: ApiRequestOptions<T> = {},
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: "same-origin",
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    return failure(
      "NETWORK_ERROR",
      "Could not reach the server. Check your connection and try again.",
    );
  }

  if (response.ok) {
    if (!schema) return { ok: true, data: undefined as T };
    const parsed = schema.safeParse(await response.json().catch(() => null));
    return parsed.success
      ? { ok: true, data: parsed.data }
      : failure("INTERNAL_ERROR", "The server sent an unexpected response.");
  }

  const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return failure("INTERNAL_ERROR", "Something went wrong. Please try again.");
  }

  const { code, message, details = [] } = parsed.data.error;

  // The session ended while the page was open: send the user to log in again.
  // A full page load (rather than a client-side navigation) also discards any
  // data of the previous session still held in memory.
  if (code === "UNAUTHENTICATED" && !path.startsWith("/auth/")) {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  const fieldErrors: FieldErrors = {};
  for (const detail of details) {
    fieldErrors[detail.path] ??= detail.message;
  }
  return { ok: false, code, message, fieldErrors };
}

function failure<T>(code: ApiErrorCode | "NETWORK_ERROR", message: string): ApiResult<T> {
  return { ok: false, code, message, fieldErrors: {} };
}
