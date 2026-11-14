import { apiRequest, type ApiResult } from "@/lib/api-client";

/** Calls one of the auth endpoints and attaches "email already used" to the email field. */
export async function sendAuthRequest(
  path: "/login" | "/register" | "/logout",
  body?: unknown,
): Promise<ApiResult<undefined>> {
  const result = await apiRequest("POST", `/auth${path}`, { body });

  if (!result.ok && result.code === "EMAIL_TAKEN") {
    return { ...result, fieldErrors: { ...result.fieldErrors, email: result.message } };
  }
  return result;
}
