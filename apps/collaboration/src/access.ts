import type { PrismaClient } from "@syncspace/database";
import { canEditDocument, resolveDocumentRole } from "@syncspace/shared";

export interface ConnectionIdentity {
  userId: string;
  sessionId: string;
  documentId: string;
}

export interface DocumentAccess {
  canEdit: boolean;
}

/**
 * Decides, from the database alone, what a connection may do with a document.
 *
 * Returns null (no access) unless all of these hold right now:
 * - the login session still exists, belongs to the user and has not expired
 *   (logging out deletes it),
 * - the document exists and is not deleted,
 * - the user is a member of the document's workspace, or the document was
 *   shared with them.
 *
 * The role comes from `resolveDocumentRole`, the same function the REST API
 * uses, so the two services always agree. Nothing a client sends can
 * influence the result.
 */
export async function resolveDocumentAccess(
  db: PrismaClient,
  { userId, sessionId, documentId }: ConnectionIdentity,
): Promise<DocumentAccess | null> {
  const [session, document] = await Promise.all([
    db.session.findFirst({
      where: { id: sessionId, userId, expiresAt: { gt: new Date() } },
      select: { id: true },
    }),
    db.document.findFirst({
      where: { id: documentId, deletedAt: null },
      select: {
        workspace: { select: { members: { where: { userId }, select: { role: true } } } },
        permissions: { where: { userId }, select: { role: true } },
      },
    }),
  ]);
  if (!session || !document) return null;

  const role = resolveDocumentRole({
    workspaceRole: document.workspace.members[0]?.role,
    grantedRole: document.permissions[0]?.role,
  });
  if (!role) return null;

  return { canEdit: canEditDocument(role) };
}
