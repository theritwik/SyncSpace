import { z } from "zod";

/**
 * Name of the shared type inside each Yjs document that holds the editor
 * content. Client and server must agree on it.
 */
export const COLLABORATION_FIELD = "default";

/** How long a collaboration token is valid. It is only used to open a connection. */
export const COLLABORATION_TOKEN_TTL_SECONDS = 60;

/** WebSocket close code sent when a connection loses access to its document. */
export const ACCESS_REVOKED_CLOSE_CODE = 4403;

/** Response of `POST /documents/:id/collaboration-token`. */
export const collaborationTokenResponseSchema = z.object({
  token: z.string(),
  expiresAt: z.iso.datetime(),
});

/**
 * Message the collaboration server sends to clients after it has written a
 * document to the database (and once when a client connects).
 *
 * `snapshot` is a base64 Yjs snapshot of exactly what is stored. A client
 * whose own document equals that snapshot knows all its content is persisted.
 */
export const collaborationServerMessageSchema = z.object({
  type: z.literal("saved"),
  snapshot: z.string(),
});

export type CollaborationTokenResponse = z.infer<typeof collaborationTokenResponseSchema>;
export type CollaborationServerMessage = z.infer<typeof collaborationServerMessageSchema>;
