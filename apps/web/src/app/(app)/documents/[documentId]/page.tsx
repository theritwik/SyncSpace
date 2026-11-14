import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCollaborationUrl } from "@/config/env";
import { requireUser } from "@/features/auth/session";
import { getDocument, listDocumentPermissions, listFolders } from "@/features/documents/data";
import { DocumentView } from "@/features/documents/document-view";

type Props = PageProps<"/documents/[documentId]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const document = await getDocument((await params).documentId);
  return { title: document?.title ?? "Document not found" };
}

export default async function DocumentPage({ params }: Props) {
  const document = await getDocument((await params).documentId);
  // Also the case for deleted documents and documents of workspaces the user is not in.
  if (!document) notFound();

  const [folders, permissions, user] = await Promise.all([
    // The folder tree belongs to the workspace; people the document was only
    // shared with cannot load it (and cannot move the document anyway).
    document.isWorkspaceMember ? listFolders(document.workspace.slug) : [],
    listDocumentPermissions(document.id),
    requireUser(),
  ]);
  if (!folders || !permissions) notFound();

  return (
    <DocumentView
      document={document}
      folders={folders}
      permissions={permissions}
      user={{ id: user.id, name: user.name }}
      collaborationUrl={getCollaborationUrl()}
    />
  );
}
