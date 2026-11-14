import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { listDocuments, listFolders } from "@/features/documents/data";
import { getWorkspace } from "@/features/workspaces/data";
import { WorkspaceOverview } from "@/features/workspaces/workspace-overview";

const RECENT_DOCUMENTS_LIMIT = 5;

export async function generateMetadata({ params }: PageProps<"/w/[slug]">): Promise<Metadata> {
  const workspace = await getWorkspace((await params).slug);
  return { title: workspace?.name ?? "Workspace not found" };
}

export default async function WorkspacePage({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const [workspace, recentDocuments, folders] = await Promise.all([
    getWorkspace(slug),
    listDocuments(slug, { limit: RECENT_DOCUMENTS_LIMIT }),
    listFolders(slug),
  ]);
  // Also the case when the user is not a member: the API does not distinguish the two.
  if (!workspace || !recentDocuments || !folders) notFound();

  return (
    <WorkspaceOverview workspace={workspace} recentDocuments={recentDocuments} folders={folders} />
  );
}
