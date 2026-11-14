import type { PrismaClient, Workspace, WorkspaceRole } from "@syncspace/database";

import { HttpError } from "../../http/errors.js";

export interface WorkspaceAccess {
  workspace: Workspace & { _count: { members: number } };
  role: WorkspaceRole;
}

/**
 * The single gate to a workspace: loads it only if the user is a member.
 *
 * The lookup goes through the membership table, so a workspace the user does
 * not belong to is indistinguishable from one that does not exist. Both give
 * 404, which avoids revealing which workspace slugs are in use.
 */
export async function requireWorkspaceAccess(
  db: PrismaClient,
  userId: string,
  slug: string,
): Promise<WorkspaceAccess> {
  const membership = await db.workspaceMember.findFirst({
    where: { userId, workspace: { slug } },
    include: { workspace: { include: { _count: { select: { members: true } } } } },
  });

  if (!membership) {
    throw new HttpError(404, "NOT_FOUND", "Workspace not found.");
  }

  return { workspace: membership.workspace, role: membership.role };
}

/** Throws 403 when a member's role does not allow the action. */
export function assertAllowed(allowed: boolean): void {
  if (!allowed) {
    throw new HttpError(403, "FORBIDDEN", "You do not have permission to do this.");
  }
}
