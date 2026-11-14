import type { DocumentDetail, FolderSummary } from "@syncspace/shared";
import { FileTextIcon } from "lucide-react";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { ActiveWorkspace } from "@/features/dashboard/active-workspace";
import { formatDate, formatDateTime } from "@/lib/format";

import { DocumentActions } from "./document-actions";
import { DocumentTitle } from "./document-title";

interface DocumentViewProps {
  document: DocumentDetail;
  /** Every folder of the document's workspace. */
  folders: FolderSummary[];
}

export function DocumentView({ document, folders }: DocumentViewProps) {
  const { workspace, folderPath } = document;
  const parentFolder = folderPath.at(-1);

  return (
    <article className="space-y-6">
      {/* The URL has no workspace in it, so tell the sidebar which one this is. */}
      <ActiveWorkspace slug={workspace.slug} />

      <Breadcrumbs
        items={[
          { label: workspace.name, href: `/w/${workspace.slug}` },
          { label: "Documents", href: `/w/${workspace.slug}/documents` },
          ...folderPath.map((folder) => ({
            label: folder.name,
            href: `/w/${workspace.slug}/folders/${folder.id}`,
          })),
          { label: document.title },
        ]}
      />

      <header className="space-y-1">
        <div className="flex items-start gap-3">
          {/* The key resets the field when the title changes elsewhere (e.g. the rename dialog). */}
          <DocumentTitle key={document.title} documentId={document.id} title={document.title} />
          <div className="pt-2">
            <DocumentActions
              document={{ id: document.id, title: document.title, folderId: document.folderId }}
              folders={folders}
              redirectAfterDelete={
                parentFolder
                  ? `/w/${workspace.slug}/folders/${parentFolder.id}`
                  : `/w/${workspace.slug}/documents`
              }
            />
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-1.5">
            <dt>Created</dt>
            <dd className="text-foreground">
              {formatDate(document.createdAt)}
              {document.createdBy ? ` by ${document.createdBy.name}` : null}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt>Last updated</dt>
            <dd className="text-foreground">{formatDateTime(document.updatedAt)}</dd>
          </div>
        </dl>
      </header>

      {/* Where the editor will be mounted. There is no content to show or edit yet. */}
      <section
        aria-label="Document content"
        className="flex min-h-96 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileTextIcon aria-hidden className="size-5" />
        </span>
        <div className="space-y-1">
          <h2 className="font-medium">This document is empty</h2>
          <p className="mx-auto max-w-sm text-sm text-pretty text-muted-foreground">
            Writing and editing are not available in SyncSpace yet. For now you can rename, move
            and delete the document.
          </p>
        </div>
      </section>
    </article>
  );
}
