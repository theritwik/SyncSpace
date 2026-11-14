import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getCollaborationUrl } from "@/config/env";
import { requireUser } from "@/features/auth/session";
import { getDocument, listFolders } from "@/features/documents/data";
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

  const [folders, user] = await Promise.all([
    listFolders(document.workspace.slug),
    requireUser(),
  ]);
  if (!folders) notFound();

  return (
    <DocumentView
      document={document}
      folders={folders}
      user={{ id: user.id, name: user.name }}
      collaborationUrl={getCollaborationUrl()}
    />
  );
}
