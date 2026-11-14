import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listSharedDocuments } from "@/features/documents/data";
import { SharedDocumentList } from "@/features/sharing/shared-document-list";

export const metadata: Metadata = { title: "Shared with me" };

export default async function SharedPage() {
  const documents = await listSharedDocuments();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Shared with me"
        description="Documents from other people's workspaces that were shared with you."
      />
      <SharedDocumentList documents={documents} />
    </div>
  );
}
