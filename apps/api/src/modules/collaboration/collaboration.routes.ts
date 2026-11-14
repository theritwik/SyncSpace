import type { PrismaClient } from "@syncspace/database";
import {
  COLLABORATION_TOKEN_TTL_SECONDS,
  type CollaborationTokenResponse,
} from "@syncspace/shared";
import { signCollaborationToken } from "@syncspace/shared/collaboration-token";
import type { FastifyPluginAsync } from "fastify";

import { validate } from "../../http/errors.js";
import { requireSession } from "../auth/session.js";
import { documentParamsSchema, requireDocumentAccess } from "../documents/document.access.js";

export interface CollaborationRoutesOptions {
  db: PrismaClient;
  tokenSecret: string;
}

/**
 * The only REST endpoint of the collaboration feature. Document content never
 * travels through this API: it is synchronised by the collaboration service
 * over a WebSocket. This endpoint just hands a signed-in user a short-lived
 * token with which the browser can open that WebSocket.
 */
export const collaborationRoutes: FastifyPluginAsync<CollaborationRoutesOptions> = async (
  app,
  { db, tokenSecret },
) => {
  app.post("/documents/:id/collaboration-token", async (request, reply) => {
    const { sessionId, user } = await requireSession(db, request);
    const { id } = validate(documentParamsSchema, request.params);
    // Viewers get a token too: they may read. The collaboration service
    // decides read-only vs. read-write itself, from the database.
    const { document } = await requireDocumentAccess(db, user.id, id);

    const exp = Math.floor(Date.now() / 1000) + COLLABORATION_TOKEN_TTL_SECONDS;
    const token = signCollaborationToken(
      { userId: user.id, sessionId, documentId: document.id, exp },
      tokenSecret,
    );

    reply.header("cache-control", "no-store");
    return { token, expiresAt: new Date(exp * 1000).toISOString() } satisfies CollaborationTokenResponse;
  });
};
