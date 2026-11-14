// Node-only (uses node:crypto). Import it from "@syncspace/shared/collaboration-token",
// never from browser code.
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

/**
 * A collaboration token lets a browser open a WebSocket to the collaboration
 * server for one document. The API issues it after checking the session
 * cookie; the collaboration server, which never sees that cookie, verifies it.
 *
 * It says who is asking and for which document, nothing about what they may
 * do. Permissions are always looked up in the database by the server.
 *
 * Format: base64url(JSON payload) + "." + base64url(HMAC-SHA256 of the first part).
 * Only the two servers know the secret, so a client cannot forge or alter one.
 */
const payloadSchema = z.object({
  userId: z.uuid(),
  /** The login session the token was issued for; ending that session ends the access. */
  sessionId: z.uuid(),
  documentId: z.uuid(),
  /** Expiry as a Unix timestamp in seconds. */
  exp: z.number().int().positive(),
});

export type CollaborationTokenPayload = z.infer<typeof payloadSchema>;

function sign(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function signCollaborationToken(payload: CollaborationTokenPayload, secret: string): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encodedPayload}.${sign(encodedPayload, secret).toString("base64url")}`;
}

/** Returns the payload of a genuine, unexpired token, or null. Never throws. */
export function verifyCollaborationToken(
  token: string,
  secret: string,
  now: Date = new Date(),
): CollaborationTokenPayload | null {
  const [encodedPayload, encodedSignature, ...rest] = token.split(".");
  if (!encodedPayload || !encodedSignature || rest.length > 0) return null;

  const expected = sign(encodedPayload, secret);
  const actual = Buffer.from(encodedSignature, "base64url");
  // timingSafeEqual avoids leaking, through response time, how much of a forged signature was right.
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const payload = payloadSchema.safeParse(json);
  if (!payload.success) return null;

  return payload.data.exp * 1000 > now.getTime() ? payload.data : null;
}
