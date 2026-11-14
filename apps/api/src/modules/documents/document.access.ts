import type { Document, PrismaClient, User, Workspace, WorkspaceRole } from "@syncspace/database";
import { resolveDocumentRole, type DocumentRole } from "@syncspace/shared";
import { z } from "zod";

import { HttpError } from "../../http/errors.js";

export const documentParamsSchema = z.object({ id: z.uuid("Invalid document identifier.") });

export interface DocumentAccess {
  document: Document & { createdBy: User | null; workspace: Workspace };
  /** The requesting user's effective role for this document. */
  role: DocumentRole;
  /** Their role in the document's workspace, or null if they are not a member. */
  workspaceRole: WorkspaceRole | null;
}

/**
 * The single gate to a document. Every document route calls it first.
 *
 * It loads the document together with the two things that can give the user
 * access: their membership of the document's workspace and a grant on the
 * document itself. `resolveDocumentRole` turns those into one effective role.
 *
 * No access, a deleted document and an unknown id all produce the same 404,
 * so the response never reveals whether a document id exists.
 * Callers then check what the role allows and answer 403 if it is not enough.
 */
export async function requireDocumentAccess(
  db: PrismaClient,
  userId: string,
  documentId: string,
): Promise<DocumentAccess> {
  const document = await db.document.findFirst({
    where: { id: documentId, deletedAt: null },
    include: {
      createdBy: true,
      // Each list has at most one row: the requesting user's own.
      workspace: { include: { members: { where: { userId } } } },
      permissions: { where: { userId } },
    },
  });

  const workspaceRole = document?.workspace.members[0]?.role ?? null;
  const role = resolveDocumentRole({
    workspaceRole,
    grantedRole: document?.permissions[0]?.role,
  });

  if (!document || !role) {
    throw new HttpError(404, "NOT_FOUND", "Document not found.");
  }
  return { document, role, workspaceRole };
}
