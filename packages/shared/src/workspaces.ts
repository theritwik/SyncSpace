import { z } from "zod";

export const WORKSPACE_NAME_MAX_LENGTH = 60;

export const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "MEMBER", "VIEWER"]);

const workspaceNameSchema = z
  .string("Enter a workspace name.")
  .trim()
  .min(1, "Enter a workspace name.")
  .max(WORKSPACE_NAME_MAX_LENGTH, `Name must be at most ${WORKSPACE_NAME_MAX_LENGTH} characters.`);

export const createWorkspaceRequestSchema = z.object({ name: workspaceNameSchema });
export const updateWorkspaceRequestSchema = z.object({ name: workspaceNameSchema });

/** A workspace as seen by one of its members: `role` is the requesting user's role. */
export const workspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
  role: workspaceRoleSchema,
  memberCount: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const workspaceMemberSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  email: z.email(),
  role: workspaceRoleSchema,
  joinedAt: z.iso.datetime(),
});

export const workspaceResponseSchema = z.object({ workspace: workspaceSchema });
export const workspaceListResponseSchema = z.object({ workspaces: z.array(workspaceSchema) });
export const workspaceMembersResponseSchema = z.object({ members: z.array(workspaceMemberSchema) });

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type WorkspaceSummary = z.infer<typeof workspaceSchema>;
export type WorkspaceMemberSummary = z.infer<typeof workspaceMemberSchema>;
export type WorkspaceResponse = z.infer<typeof workspaceResponseSchema>;
export type WorkspaceListResponse = z.infer<typeof workspaceListResponseSchema>;
export type WorkspaceMembersResponse = z.infer<typeof workspaceMembersResponseSchema>;

/**
 * What each role may do. Kept next to the role definition so the API (which
 * enforces it) and the web app (which hides controls accordingly) agree.
 */
export function canManageWorkspace(role: WorkspaceRole): boolean {
  return role === "OWNER" || role === "ADMIN";
}

export function canDeleteWorkspace(role: WorkspaceRole): boolean {
  return role === "OWNER";
}

/** Create, rename, move, delete and write documents, and create folders. Viewers may only read. */
export function canEditDocuments(role: WorkspaceRole): boolean {
  return role !== "VIEWER";
}
