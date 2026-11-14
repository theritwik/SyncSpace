import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getWorkspace } from "@/features/workspaces/data";
import { WorkspaceOverview } from "@/features/workspaces/workspace-overview";

export async function generateMetadata({ params }: PageProps<"/w/[slug]">): Promise<Metadata> {
  const workspace = await getWorkspace((await params).slug);
  return { title: workspace?.name ?? "Workspace not found" };
}

export default async function WorkspacePage({ params }: PageProps<"/w/[slug]">) {
  const workspace = await getWorkspace((await params).slug);
  // Also the case when the user is not a member: the API does not distinguish the two.
  if (!workspace) notFound();

  return <WorkspaceOverview workspace={workspace} />;
}
