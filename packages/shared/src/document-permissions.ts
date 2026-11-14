import { z } from "zod";

import { workspaceRoleSchema, type WorkspaceRole } from "./workspaces.js";

/** What a user may do with one particular document. */
export const documentRoleSchema = z.enum(["OWNER", "EDITOR", "VIEWER"]);
export type DocumentRole = z.infer<typeof documentRoleSchema>;

const ROLE_RANK: Record<DocumentRole, number> = { VIEWER: 1, EDITOR: 2, OWNER: 3 };

/** The document role that a workspace role implies for every document of that workspace. */
const ROLE_FROM_WORKSPACE: Record<WorkspaceRole, DocumentRole> = {
  OWNER: "OWNER",
  ADMIN: "OWNER",
  MEMBER: "EDITOR",
  VIEWER: "VIEWER",
};

/**
 * THE authorization rule for documents. The API and the collaboration server
 * both call this one function, so they cannot disagree.
 *
 * A user can have access from two sources:
 *   - their role in the document's workspace (if they are a member), and
 *   - a grant on this specific document (if it was shared with them).
 *
 * The effective role is the higher of the two. A grant can therefore add
 * access but never take away what workspace membership already gives.
 * With neither source the result is null: no access at all.
 */
export function resolveDocumentRole(sources: {
  workspaceRole: WorkspaceRole | null | undefined;
  grantedRole: DocumentRole | null | undefined;
}): DocumentRole | null {
  const fromWorkspace = sources.workspaceRole ? ROLE_FROM_WORKSPACE[sources.workspaceRole] : null;
  const candidates = [fromWorkspace, sources.grantedRole ?? null].filter(
    (role): role is DocumentRole => role !== null,
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((best, role) => (ROLE_RANK[role] > ROLE_RANK[best] ? role : best));
}

/** Change the content or the title. */
export function canEditDocument(role: DocumentRole): boolean {
  return role === "OWNER" || role === "EDITOR";
}

/** Share the document, change collaborators' roles, remove collaborators. */
export function canManageSharing(role: DocumentRole): boolean {
  return role === "OWNER";
}

export function canDeleteDocument(role: DocumentRole): boolean {
  return role === "OWNER";
}

const shareEmailSchema = z
  .string("Enter an email address.")
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "Email is too long."));

export const shareDocumentRequestSchema = z.object({
  email: shareEmailSchema,
  role: documentRoleSchema,
});

export const updateDocumentPermissionRequestSchema = z.object({
  role: documentRoleSchema,
});

/** One person the document was shared with directly. */
export const documentPermissionSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  /** Only present for users who may manage sharing. */
  email: z.email().nullable(),
  role: documentRoleSchema,
  grantedAt: z.iso.datetime(),
});

export const documentPermissionResponseSchema = z.object({ permission: documentPermissionSchema });
export const documentPermissionListResponseSchema = z.object({
  permissions: z.array(documentPermissionSchema),
});

/** A document someone shared with the user from a workspace they are not a member of. */
export const sharedDocumentSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  role: documentRoleSchema,
  workspaceName: z.string(),
  sharedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const sharedDocumentListResponseSchema = z.object({
  documents: z.array(sharedDocumentSchema),
});

export type ShareDocumentRequest = z.infer<typeof shareDocumentRequestSchema>;
export type DocumentPermissionSummary = z.infer<typeof documentPermissionSchema>;
export type DocumentPermissionResponse = z.infer<typeof documentPermissionResponseSchema>;
export type DocumentPermissionListResponse = z.infer<typeof documentPermissionListResponseSchema>;
export type SharedDocumentSummary = z.infer<typeof sharedDocumentSchema>;
export type SharedDocumentListResponse = z.infer<typeof sharedDocumentListResponseSchema>;

// Re-exported so callers of this module do not need a second import for the input type.
export { workspaceRoleSchema };
