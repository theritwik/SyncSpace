import type { DocumentPermission, PrismaClient, User } from "@syncspace/database";
import {
  canManageSharing,
  shareDocumentRequestSchema,
  updateDocumentPermissionRequestSchema,
  type DocumentPermissionListResponse,
  type DocumentPermissionResponse,
  type DocumentPermissionSummary,
  type SharedDocumentListResponse,
} from "@syncspace/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { HttpError, validate } from "../../http/errors.js";
import { requireUser } from "../auth/session.js";
import { documentParamsSchema, requireDocumentAccess } from "../documents/document.access.js";
import { assertAllowed } from "../workspaces/workspace.access.js";

export interface SharingRoutesOptions {
  db: PrismaClient;
  /** Share requests allowed per client IP per window. */
  shareRateLimit: { max: number; windowMs: number };
}

const permissionParamsSchema = documentParamsSchema.extend({
  userId: z.uuid("Invalid user identifier."),
});

function toPermissionSummary(
  permission: DocumentPermission & { user: User },
  includeEmail: boolean,
): DocumentPermissionSummary {
  return {
    userId: permission.userId,
    name: permission.user.name,
    email: includeEmail ? permission.user.email : null,
    role: permission.role,
    grantedAt: permission.createdAt.toISOString(),
  };
}

/**
 * Sharing a document with specific people.
 *
 * Rules enforced here, whatever the client shows or sends:
 * - Only someone whose effective role is OWNER may share, change roles or
 *   remove people. Everyone else with access gets 403; everyone without gets 404.
 * - The role to grant is taken from a fixed list. The grantor is taken from
 *   the session, never from the request body.
 * - Nobody can change or remove their own grant, so an owner cannot lock
 *   themselves out by accident and nobody can alter their own role.
 */
export const sharingRoutes: FastifyPluginAsync<SharingRoutesOptions> = async (
  app,
  { db, shareRateLimit },
) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  /**
   * Documents shared with the user from workspaces they are not a member of.
   * (Documents of their own workspaces are found through the workspace.)
   */
  app.get("/documents/shared", async (request): Promise<SharedDocumentListResponse> => {
    const user = await requireUser(db, request);

    const permissions = await db.documentPermission.findMany({
      where: {
        userId: user.id,
        document: { deletedAt: null, workspace: { members: { none: { userId: user.id } } } },
      },
      include: { document: { include: { workspace: true } } },
      orderBy: { document: { updatedAt: "desc" } },
      take: 100,
    });

    return {
      documents: permissions.map(({ document, role, createdAt }) => ({
        id: document.id,
        title: document.title,
        role,
        workspaceName: document.workspace.name,
        sharedAt: createdAt.toISOString(),
        updatedAt: document.updatedAt.toISOString(),
      })),
    };
  });

  /** The people this document was shared with directly. */
  app.get(
    "/documents/:id/permissions",
    async (request): Promise<DocumentPermissionListResponse> => {
      const user = await requireUser(db, request);
      const { id } = validate(documentParamsSchema, request.params);
      const { document, role } = await requireDocumentAccess(db, user.id, id);

      const permissions = await db.documentPermission.findMany({
        where: { documentId: document.id },
        include: { user: true },
        orderBy: { createdAt: "asc" },
      });

      // Everyone with access may see who else has it, but email addresses are
      // only shown to the people who manage sharing.
      const includeEmail = canManageSharing(role);
      return {
        permissions: permissions.map((permission) => toPermissionSummary(permission, includeEmail)),
      };
    },
  );

  /** Share with a registered user by email, or change the role of someone already added. */
  app.post(
    "/documents/:id/permissions",
    { config: { rateLimit: { max: shareRateLimit.max, timeWindow: shareRateLimit.windowMs } } },
    async (request, reply): Promise<DocumentPermissionResponse> => {
      const user = await requireUser(db, request);
      const { id } = validate(documentParamsSchema, request.params);
      const { document, role } = await requireDocumentAccess(db, user.id, id);
      assertAllowed(canManageSharing(role));
      const { email, role: grantedRole } = validate(shareDocumentRequestSchema, request.body);

      const target = await db.user.findUnique({ where: { email } });
      if (!target) {
        throw new HttpError(400, "VALIDATION_ERROR", "Some fields are invalid.", [
          { path: "email", message: "No SyncSpace account uses this email address." },
        ]);
      }
      if (target.id === user.id) {
        throw new HttpError(400, "VALIDATION_ERROR", "Some fields are invalid.", [
          { path: "email", message: "You already have access to this document." },
        ]);
      }

      const key = { documentId_userId: { documentId: document.id, userId: target.id } };
      const existing = await db.documentPermission.findUnique({ where: key });
      const permission = await db.documentPermission.upsert({
        where: key,
        create: {
          documentId: document.id,
          userId: target.id,
          role: grantedRole,
          grantedById: user.id,
        },
        update: { role: grantedRole, grantedById: user.id },
        include: { user: true },
      });

      reply.code(existing ? 200 : 201);
      return { permission: toPermissionSummary(permission, true) };
    },
  );

  /** Loads the grant a PATCH/DELETE is aimed at, after checking the caller may manage sharing. */
  async function requireManageableGrant(userId: string, params: unknown) {
    const { id, userId: targetUserId } = validate(permissionParamsSchema, params);
    const { document, role } = await requireDocumentAccess(db, userId, id);
    assertAllowed(canManageSharing(role));
    if (targetUserId === userId) {
      throw new HttpError(403, "FORBIDDEN", "You cannot change your own access.");
    }

    const key = { documentId_userId: { documentId: document.id, userId: targetUserId } };
    if (!(await db.documentPermission.findUnique({ where: key }))) {
      throw new HttpError(404, "NOT_FOUND", "This person does not have direct access.");
    }
    return key;
  }

  app.patch(
    "/documents/:id/permissions/:userId",
    async (request): Promise<DocumentPermissionResponse> => {
      const user = await requireUser(db, request);
      const key = await requireManageableGrant(user.id, request.params);
      const { role } = validate(updateDocumentPermissionRequestSchema, request.body);

      const permission = await db.documentPermission.update({
        where: key,
        data: { role, grantedById: user.id },
        include: { user: true },
      });

      return { permission: toPermissionSummary(permission, true) };
    },
  );

  app.delete("/documents/:id/permissions/:userId", async (request, reply) => {
    const user = await requireUser(db, request);
    const key = await requireManageableGrant(user.id, request.params);

    // deleteMany does not throw if a concurrent request already removed the grant.
    await db.documentPermission.deleteMany({
      where: { documentId: key.documentId_userId.documentId, userId: key.documentId_userId.userId },
    });

    return reply.code(204).send();
  });
};
