import type { DocumentRole, WorkspaceRole } from "@syncspace/shared";

export const ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const DOCUMENT_ROLE_LABELS: Record<DocumentRole, string> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export const DOCUMENT_ROLE_DESCRIPTIONS: Record<DocumentRole, string> = {
  OWNER: "Can edit, share and delete",
  EDITOR: "Can edit",
  VIEWER: "Can only read",
};
