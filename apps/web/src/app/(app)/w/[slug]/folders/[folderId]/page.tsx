import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { listDocuments, listFolders } from "@/features/documents/data";
import { DocumentBrowser } from "@/features/documents/document-browser";
import { getWorkspace } from "@/features/workspaces/data";

type Props = PageProps<"/w/[slug]/folders/[folderId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, folderId } = await params;
  const folder = (await listFolders(slug))?.find((candidate) => candidate.id === folderId);
  return { title: folder?.name ?? "Folder not found" };
}

export default async function FolderPage({ params }: Props) {
  const { slug, folderId } = await params;
  const [workspace, folders] = await Promise.all([getWorkspace(slug), listFolders(slug)]);
  // The folder is looked up among this workspace's folders, so a folder id
  // from another workspace is simply "not found".
  const currentFolder = folders?.find((folder) => folder.id === folderId);
  if (!workspace || !folders || !currentFolder) notFound();

  const documents = await listDocuments(slug, { folderId: currentFolder.id });
  if (!documents) notFound();

  return (
    <DocumentBrowser
      workspace={workspace}
      folders={folders}
      currentFolder={currentFolder}
      documents={documents}
    />
  );
}
