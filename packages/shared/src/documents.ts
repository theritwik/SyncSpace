import { z } from "zod";

export const DOCUMENT_TITLE_MAX_LENGTH = 120;
export const DEFAULT_DOCUMENT_TITLE = "Untitled document";
export const FOLDER_NAME_MAX_LENGTH = 60;
/** A top-level folder has depth 1. */
export const MAX_FOLDER_DEPTH = 5;
export const DOCUMENT_LIST_MAX_LIMIT = 100;

const documentTitleSchema = z
  .string("Enter a title.")
  .trim()
  .min(1, "Enter a title.")
  .max(DOCUMENT_TITLE_MAX_LENGTH, `Title must be at most ${DOCUMENT_TITLE_MAX_LENGTH} characters.`);

const folderNameSchema = z
  .string("Enter a folder name.")
  .trim()
  .min(1, "Enter a folder name.")
  .max(FOLDER_NAME_MAX_LENGTH, `Name must be at most ${FOLDER_NAME_MAX_LENGTH} characters.`);

/** `null` means "the top level of the workspace", i.e. not inside any folder. */
const folderReferenceSchema = z.uuid("Invalid folder.").nullable();

export const createDocumentRequestSchema = z.object({
  title: documentTitleSchema.default(DEFAULT_DOCUMENT_TITLE),
  folderId: folderReferenceSchema.default(null),
});

/** Rename (`title`), move (`folderId`), or both. Omitted fields are left unchanged. */
export const updateDocumentRequestSchema = z
  .object({
    title: documentTitleSchema.optional(),
    folderId: folderReferenceSchema.optional(),
  })
  .refine((value) => value.title !== undefined || value.folderId !== undefined, {
    message: "Provide a title or a folder.",
  });

export const listDocumentsQuerySchema = z.object({
  /** A folder id, or "root" for documents that are not in any folder. Omit for all documents. */
  folderId: z.union([z.literal("root"), z.uuid("Invalid folder.")]).optional(),
  limit: z.coerce.number().int().min(1).max(DOCUMENT_LIST_MAX_LIMIT).default(DOCUMENT_LIST_MAX_LIMIT),
});

export const createFolderRequestSchema = z.object({
  name: folderNameSchema,
  parentId: folderReferenceSchema.default(null),
});

export const folderSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  parentId: z.uuid().nullable(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

export const documentSchema = z.object({
  id: z.uuid(),
  workspaceId: z.uuid(),
  folderId: z.uuid().nullable(),
  title: z.string(),
  /** Null when the creating user no longer exists. */
  createdBy: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** A single document with what a page needs to show where it lives. */
export const documentDetailSchema = documentSchema.extend({
  /** Whether the requesting user may change the document (false for viewers). */
  canEdit: z.boolean(),
  workspace: z.object({ id: z.uuid(), name: z.string(), slug: z.string() }),
  /** Folders from the top level down to the one containing the document. Empty at the top level. */
  folderPath: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export const documentResponseSchema = z.object({ document: documentDetailSchema });
export const documentListResponseSchema = z.object({ documents: z.array(documentSchema) });
export const folderResponseSchema = z.object({ folder: folderSchema });
export const folderListResponseSchema = z.object({ folders: z.array(folderSchema) });

export type DocumentSummary = z.infer<typeof documentSchema>;
export type DocumentDetail = z.infer<typeof documentDetailSchema>;
export type FolderSummary = z.infer<typeof folderSchema>;
export type DocumentResponse = z.infer<typeof documentResponseSchema>;
export type DocumentListResponse = z.infer<typeof documentListResponseSchema>;
export type FolderResponse = z.infer<typeof folderResponseSchema>;
export type FolderListResponse = z.infer<typeof folderListResponseSchema>;

/**
 * The chain of folders from the top level down to `folderId`.
 * `folders` must contain every folder of the workspace.
 */
export function getFolderPath<TFolder extends { id: string; parentId: string | null }>(
  folders: TFolder[],
  folderId: string | null,
): TFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const path: TFolder[] = [];

  let current = folderId ? byId.get(folderId) : undefined;
  // The length check stops the walk if the data ever contained a cycle.
  while (current && path.length <= folders.length) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}
