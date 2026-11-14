import { apiErrorResponseSchema } from "@syncspace/shared";

export type FieldErrors = Record<string, string>;

export type AuthResult =
  | { ok: true }
  | { ok: false; message: string; fieldErrors: FieldErrors };

/**
 * Sends an auth request from the browser to `/api/v1/auth/*` on the web app's
 * own origin (forwarded to the API by `proxy.ts`).
 *
 * The session token never passes through this code: the API sets it in an
 * HttpOnly cookie, which the browser stores and sends automatically.
 */
export async function sendAuthRequest(
  path: "/login" | "/register" | "/logout",
  body?: unknown,
): Promise<AuthResult> {
  let response: Response;
  try {
    response = await fetch(`/api/v1/auth${path}`, {
      method: "POST",
      credentials: "same-origin",
      ...(body === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch {
    return failure("Could not reach the server. Check your connection and try again.");
  }

  if (response.ok) return { ok: true };

  const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return failure("Something went wrong. Please try again.");
  }

  const { code, message, details = [] } = parsed.data.error;
  const fieldErrors: FieldErrors = {};
  for (const detail of details) {
    fieldErrors[detail.path] ??= detail.message;
  }
  if (code === "EMAIL_TAKEN") {
    fieldErrors.email = message;
  }

  return { ok: false, message, fieldErrors };
}

function failure(message: string): AuthResult {
  return { ok: false, message, fieldErrors: {} };
}
