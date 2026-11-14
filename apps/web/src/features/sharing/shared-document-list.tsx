import type { SharedDocumentSummary } from "@syncspace/shared";
import { FileTextIcon, UsersIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { DOCUMENT_ROLE_LABELS } from "@/features/workspaces/roles";
import { formatDateTime } from "@/lib/format";

export function SharedDocumentList({ documents }: { documents: SharedDocumentSummary[] }) {
  if (documents.length === 0) {
    return (
      <EmptyState
        icon={UsersIcon}
        title="Nothing has been shared with you"
        description="When someone shares a document with you from a workspace you are not a member of, it appears here."
      />
    );
  }

  return (
    <ul className="divide-y rounded-xl border bg-card shadow-xs">
      {documents.map((document) => (
        <li key={document.id} className="flex items-center gap-3 px-4 py-3">
          <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <Link
              href={`/documents/${document.id}`}
              className="block truncate rounded-sm text-sm font-medium outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {document.title}
            </Link>
            <p className="truncate text-xs text-muted-foreground">
              From {document.workspaceName} · Updated {formatDateTime(document.updatedAt)}
            </p>
          </div>
          <Badge variant="secondary">{DOCUMENT_ROLE_LABELS[document.role]}</Badge>
        </li>
      ))}
    </ul>
  );
}
