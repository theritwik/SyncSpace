import "server-only";

import {
  documentListResponseSchema,
  documentResponseSchema,
  folderListResponseSchema,
  type DocumentDetail,
  type DocumentSummary,
  type FolderSummary,
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
