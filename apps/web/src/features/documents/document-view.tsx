import type {
  DocumentDetail,
  DocumentPermissionSummary,
  FolderSummary,
} from "@syncspace/shared";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { ActiveWorkspace } from "@/features/dashboard/active-workspace";
import { DocumentEditor } from "@/features/editor/document-editor";
import { ShareDialog } from "@/features/sharing/share-dialog";
import { DOCUMENT_ROLE_LABELS } from "@/features/workspaces/roles";
import { formatDate, formatDateTime } from "@/lib/format";

import { DocumentActions } from "./document-actions";
import { DocumentTitle } from "./document-title";

interface DocumentViewProps {
  document: DocumentDetail;
  /** Every folder of the document's workspace (empty for people outside the workspace). */
  folders: FolderSummary[];
  /** People the document was shared with directly. */
  permissions: DocumentPermissionSummary[];
  /** The signed-in user, shown to others as a collaborator. */
  user: { id: string; name: string };
  collaborationUrl: string;
}

export function DocumentView({
  document,
  folders,
  permissions,
  user,
  collaborationUrl,
}: DocumentViewProps) {
  const { workspace, folderPath } = document;
  const parentFolder = folderPath.at(-1);

  return (
    <article className="space-y-6">
      {/* The URL has no workspace in it, so tell the sidebar which one this is. */}
      {document.isWorkspaceMember ? <ActiveWorkspace slug={workspace.slug} /> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Breadcrumbs
          items={
            document.isWorkspaceMember
              ? [
                  { label: workspace.name, href: `/w/${workspace.slug}` },
                  { label: "Documents", href: `/w/${workspace.slug}/documents` },
                  ...folderPath.map((folder) => ({
                    label: folder.name,
                    href: `/w/${workspace.slug}/folders/${folder.id}`,
                  })),
                  { label: document.title },
                ]
              : // Someone from outside the workspace: no links into it.
                [{ label: "Shared with me", href: "/shared" }, { label: document.title }]
          }
        />
        <ShareDialog
          documentId={document.id}
          documentTitle={document.title}
          workspaceName={workspace.name}
          permissions={permissions}
          currentUserId={user.id}
          canManage={document.canShare}
        />
      </div>

      <header className="space-y-1">
        {document.canEdit ? (
          <div className="flex items-start gap-3">
            {/* The key resets the field when the title changes elsewhere (e.g. the rename dialog). */}
            <DocumentTitle key={document.title} documentId={document.id} title={document.title} />
            <div className="pt-2">
              <DocumentActions
                document={{ id: document.id, title: document.title, folderId: document.folderId }}
                folders={folders}
                can={{ rename: true, move: document.canMove, delete: document.canDelete }}
                redirectAfterDelete={
                  !document.isWorkspaceMember
                    ? "/shared"
                    : parentFolder
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
            <dt>Your role</dt>
            <dd className="text-foreground">{DOCUMENT_ROLE_LABELS[document.role]}</dd>
          </div>
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
