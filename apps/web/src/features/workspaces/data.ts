import "server-only";

import {
  workspaceListResponseSchema,
  workspaceMembersResponseSchema,
  workspaceResponseSchema,
  type WorkspaceMemberSummary,
  type WorkspaceSummary,
} from "@syncspace/shared";
import { cache } from "react";

import { apiGet } from "@/lib/api-server";

// `cache` shares one API call between everything that asks for the same data
// during a single page render (for example the layout and the page).

/** Workspaces the signed-in user is a member of. */
export const listWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const data = await apiGet("/workspaces", workspaceListResponseSchema);
  return data?.workspaces ?? [];
});

/** Returns null when the workspace does not exist or the user is not a member. */
export const getWorkspace = cache(async (slug: string): Promise<WorkspaceSummary | null> => {
  const data = await apiGet(`/workspaces/${encodeURIComponent(slug)}`, workspaceResponseSchema);
  return data?.workspace ?? null;
});

export const listWorkspaceMembers = cache(
  async (slug: string): Promise<WorkspaceMemberSummary[] | null> => {
    const data = await apiGet(
      `/workspaces/${encodeURIComponent(slug)}/members`,
      workspaceMembersResponseSchema,
    );
    return data?.members ?? null;
  },
);
