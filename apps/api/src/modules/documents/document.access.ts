import type { Document, PrismaClient, User, Workspace, WorkspaceRole } from "@syncspace/database";
import { z } from "zod";

import { HttpError } from "../../http/errors.js";

export const documentParamsSchema = z.object({ id: z.uuid("Invalid document identifier.") });

export interface DocumentAccess {
  document: Document & { createdBy: User | null; workspace: Workspace };
  /** The requesting user's role in the document's workspace. */
  role: WorkspaceRole;
}

/**
 * The single gate to a document: loads it only if it is not deleted and the
 * user is a member of its workspace. Anything else is a 404, so the response
 * does not reveal whether a document id exists.
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
      // At most one row: the requesting user's own membership.
      workspace: { include: { members: { where: { userId } } } },
    },
  });

  const membership = document?.workspace.members[0];
  if (!document || !membership) {
    throw new HttpError(404, "NOT_FOUND", "Document not found.");
  }
  return { document, role: membership.role };
}
