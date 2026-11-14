import type { DocumentSummary, FolderSummary } from "@syncspace/shared";
import { FileTextIcon } from "lucide-react";
import Link from "next/link";

import { formatDateTime } from "@/lib/format";

import { DocumentActions } from "./document-actions";

interface DocumentListProps {
  documents: DocumentSummary[];
  /** Every folder of the workspace. */
  folders: FolderSummary[];
  /** Show which folder each document is in (for lists that span folders). */
  showLocation?: boolean;
  /** Whether the user may rename, move and delete (false for viewers). */
  canEdit: boolean;
}

export function DocumentList({
  documents,
  folders,
  showLocation = false,
  canEdit,
}: DocumentListProps) {
  const folderNames = new Map(folders.map((folder) => [folder.id, folder.name]));

  return (
    <ul className="divide-y rounded-xl border bg-card shadow-xs">
      {documents.map((document) => {
        const location = document.folderId ? folderNames.get(document.folderId) : undefined;
        return (
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
                {showLocation && location ? `${location} · ` : null}
                Updated {formatDateTime(document.updatedAt)}
                {document.createdBy ? ` · Created by ${document.createdBy.name}` : null}
              </p>
            </div>
            {canEdit ? (
              <DocumentActions
                document={{ id: document.id, title: document.title, folderId: document.folderId }}
                folders={folders}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
