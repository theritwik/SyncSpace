import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { listDocuments, listFolders } from "@/features/documents/data";
import { DocumentBrowser } from "@/features/documents/document-browser";
import { getWorkspace } from "@/features/workspaces/data";

export async function generateMetadata({
  params,
}: PageProps<"/w/[slug]/documents">): Promise<Metadata> {
  const workspace = await getWorkspace((await params).slug);
  return { title: workspace ? `Documents · ${workspace.name}` : "Workspace not found" };
}

export default async function WorkspaceDocumentsPage({ params }: PageProps<"/w/[slug]/documents">) {
  const { slug } = await params;
  const [workspace, folders, documents] = await Promise.all([
    getWorkspace(slug),
    listFolders(slug),
    listDocuments(slug, { folderId: "root" }),
  ]);
  if (!workspace || !folders || !documents) notFound();

  return (
    <DocumentBrowser
      workspace={workspace}
      folders={folders}
      currentFolder={null}
      documents={documents}
    />
  );
}
