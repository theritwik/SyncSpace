import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { requireUser } from "@/features/auth/session";
import { getWorkspace, listWorkspaceMembers } from "@/features/workspaces/data";
import { WorkspaceSettings } from "@/features/workspaces/workspace-settings";

export async function generateMetadata({
  params,
}: PageProps<"/w/[slug]/settings">): Promise<Metadata> {
  const workspace = await getWorkspace((await params).slug);
  return { title: workspace ? `Settings · ${workspace.name}` : "Workspace not found" };
}

export default async function WorkspaceSettingsPage({ params }: PageProps<"/w/[slug]/settings">) {
  const { slug } = await params;
  const [user, workspace, members] = await Promise.all([
    requireUser(),
    getWorkspace(slug),
    listWorkspaceMembers(slug),
  ]);
  if (!workspace || !members) notFound();

  return <WorkspaceSettings workspace={workspace} members={members} currentUserId={user.id} />;
}
