import "server-only";

import {
  documentListResponseSchema,
  documentPermissionListResponseSchema,
  documentResponseSchema,
  folderListResponseSchema,
  sharedDocumentListResponseSchema,
  type DocumentDetail,
  type DocumentPermissionSummary,
  type DocumentSummary,
  type FolderSummary,
  type SharedDocumentSummary,
} from "@syncspace/shared";
import { cache } from "react";

import { apiGet } from "@/lib/api-server";

interface ListDocumentsOptions {
  /** A folder id, or "root" for documents outside any folder. Omit for all documents. */
  folderId?: string;
  limit?: number;
}

/** Documents of a workspace, most recently updated first. Null if the workspace is not accessible. */
export async function listDocuments(
  slug: string,
  { folderId, limit }: ListDocumentsOptions = {},
): Promise<DocumentSummary[] | null> {
  const query = new URLSearchParams();
  if (folderId) query.set("folderId", folderId);
  if (limit) query.set("limit", String(limit));

  const data = await apiGet(
    `/workspaces/${encodeURIComponent(slug)}/documents?${query}`,
    documentListResponseSchema,
  );
  return data?.documents ?? null;
}

/** Every folder of a workspace as a flat list. Null if the workspace is not accessible. */
export const listFolders = cache(async (slug: string): Promise<FolderSummary[] | null> => {
  const data = await apiGet(
    `/workspaces/${encodeURIComponent(slug)}/folders`,
    folderListResponseSchema,
  );
  return data?.folders ?? null;
});

/** Null when the document does not exist, was deleted, or the user may not see it. */
export const getDocument = cache(async (documentId: string): Promise<DocumentDetail | null> => {
  const data = await apiGet(`/documents/${encodeURIComponent(documentId)}`, documentResponseSchema);
  return data?.document ?? null;
});

/** The people a document was shared with directly. Null if the document is not accessible. */
export async function listDocumentPermissions(
  documentId: string,
): Promise<DocumentPermissionSummary[] | null> {
  const data = await apiGet(
    `/documents/${encodeURIComponent(documentId)}/permissions`,
    documentPermissionListResponseSchema,
  );
  return data?.permissions ?? null;
}

/** Documents shared with the user from workspaces they are not a member of. */
export async function listSharedDocuments(): Promise<SharedDocumentSummary[]> {
  const data = await apiGet("/documents/shared", sharedDocumentListResponseSchema);
  return data?.documents ?? [];
}
