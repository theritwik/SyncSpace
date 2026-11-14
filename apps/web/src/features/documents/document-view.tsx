import type { DocumentDetail, FolderSummary } from "@syncspace/shared";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ActiveWorkspace } from "@/features/dashboard/active-workspace";
import { DocumentEditor } from "@/features/editor/document-editor";
import { formatDate, formatDateTime } from "@/lib/format";

import { DocumentActions } from "./document-actions";
import { DocumentTitle } from "./document-title";

interface DocumentViewProps {
  document: DocumentDetail;
  /** Every folder of the document's workspace. */
  folders: FolderSummary[];
  /** The signed-in user, shown to others as a collaborator. */
  user: { id: string; name: string };
  collaborationUrl: string;
}

export function DocumentView({ document, folders, user, collaborationUrl }: DocumentViewProps) {
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
        {document.canEdit ? (
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
        ) : (
          // Viewers see the title as plain text and get no rename/move/delete menu.
          <h1 className="py-1 text-3xl font-semibold tracking-tight break-words">{document.title}</h1>
        )}
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

      <DocumentEditor
        documentId={document.id}
        collaborationUrl={collaborationUrl}
        user={user}
      />
    </article>
  );
}
