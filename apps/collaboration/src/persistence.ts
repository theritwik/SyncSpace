import type { PrismaClient } from "@syncspace/database";
import * as Y from "yjs";

/** Marks changes that come from the database, as opposed to from a client. */
export const PERSISTENCE_ORIGIN = "persistence";

/** Applies the stored state of a document, if any, to a freshly created Yjs document. */
export async function loadDocumentState(
  db: PrismaClient,
  documentId: string,
  document: Y.Doc,
): Promise<void> {
  const content = await db.documentContent.findUnique({ where: { documentId } });
  if (content) {
    Y.applyUpdate(document, content.state, PERSISTENCE_ORIGIN);
  }
}

/**
 * Writes the complete state of a Yjs document to PostgreSQL.
 *
 * The stored value is never simply replaced by what this process has in
 * memory. Inside one transaction the current row is locked and merged into
 * the live document first, and the merged result is what gets written.
 * Merging CRDT states cannot lose edits, so even if something else stored a
 * newer state in the meantime (for example a second server instance during a
 * deployment), neither side's changes are overwritten.
 *
 * Returns false when the document row no longer exists (its workspace was
 * deleted), in which case there is nothing to store the content for.
 */
export async function storeDocumentState(
  db: PrismaClient,
  documentId: string,
  document: Y.Doc,
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const exists = await tx.document.findUnique({ where: { id: documentId }, select: { id: true } });
    if (!exists) return false;

    const stored = await tx.$queryRaw<{ state: Uint8Array }[]>`
      SELECT state FROM document_contents WHERE document_id = ${documentId}::uuid FOR UPDATE
    `;
    if (stored[0]) {
      // A no-op when the live document already contains everything stored.
      Y.applyUpdate(document, stored[0].state, PERSISTENCE_ORIGIN);
    }

    // Copied into a plain ArrayBuffer-backed array, which is what Prisma's Bytes type expects.
    const state = new Uint8Array(Y.encodeStateAsUpdate(document));
    await tx.documentContent.upsert({
      where: { documentId },
      create: { documentId, state },
      update: { state },
    });
    // Editing the content counts as updating the document ("recently updated").
    await tx.document.updateMany({
      where: { id: documentId, deletedAt: null },
      data: { updatedAt: new Date() },
    });

    return true;
  });
}
