import {
  getFolderPath,
  MAX_FOLDER_DEPTH,
  type DocumentSummary,
  type FolderSummary,
  type WorkspaceSummary,
} from "@syncspace/shared";
import { FileTextIcon, FolderIcon, FolderOpenIcon } from "lucide-react";
import Link from "next/link";

import { Breadcrumbs, type Breadcrumb } from "@/components/breadcrumbs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";

import { DocumentList } from "./document-list";
import { NewDocumentButton } from "./new-document-button";
import { NewFolderButton } from "./new-folder-button";

interface DocumentBrowserProps {
  workspace: WorkspaceSummary;
  /** Every folder of the workspace. */
  folders: FolderSummary[];
  /** The folder being shown, or null for the top level. */
  currentFolder: FolderSummary | null;
  /** Documents directly inside the current folder (or at the top level). */
  documents: DocumentSummary[];
}

/** One level of a workspace's documents: its subfolders and the documents directly in it. */
export function DocumentBrowser({
  workspace,
  folders,
  currentFolder,
  documents,
}: DocumentBrowserProps) {
  const currentFolderId = currentFolder?.id ?? null;
  const folderPath = getFolderPath(folders, currentFolderId);
  const subfolders = folders.filter((folder) => folder.parentId === currentFolderId);
  const canNestDeeper = folderPath.length < MAX_FOLDER_DEPTH;

  const breadcrumbs: Breadcrumb[] = [
    { label: workspace.name, href: `/w/${workspace.slug}` },
    { label: "Documents", href: currentFolder ? `/w/${workspace.slug}/documents` : undefined },
    ...folderPath.map((folder) => ({
      label: folder.name,
      href: folder.id === currentFolderId ? undefined : `/w/${workspace.slug}/folders/${folder.id}`,
    })),
  ];

  return (
    <div className="space-y-6">
      <Breadcrumbs items={breadcrumbs} />
      <PageHeader
        title={currentFolder?.name ?? "Documents"}
        description={
          currentFolder ? undefined : `Everything in the “${workspace.name}” workspace.`
        }
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {canNestDeeper ? (
              <NewFolderButton
                workspaceSlug={workspace.slug}
                parentId={currentFolderId}
                parentName={currentFolder?.name}
              />
            ) : null}
            <NewDocumentButton workspaceSlug={workspace.slug} folderId={currentFolderId} />
          </div>
        }
      />

      {subfolders.length > 0 ? (
        <section aria-labelledby="folders-heading" className="space-y-3">
          <h2 id="folders-heading" className="text-sm font-medium text-muted-foreground">
            Folders
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {subfolders.map((folder) => (
              <li key={folder.id}>
                <Link
                  href={`/w/${workspace.slug}/folders/${folder.id}`}
                  className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm font-medium shadow-xs transition-[border-color,box-shadow] outline-none hover:border-foreground/20 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{folder.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {documents.length > 0 ? (
        <section aria-labelledby="documents-heading" className="space-y-3">
          <h2 id="documents-heading" className="text-sm font-medium text-muted-foreground">
            Documents
          </h2>
          <DocumentList documents={documents} folders={folders} />
        </section>
      ) : subfolders.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {currentFolder
            ? "There are no documents directly in this folder."
            : "There are no documents at the top level."}
        </p>
      ) : currentFolder ? (
        <EmptyState
          icon={FolderOpenIcon}
          title="This folder is empty"
          description="Create a document here, or move an existing document into this folder."
        />
      ) : (
        <EmptyState
          icon={FileTextIcon}
          title="No documents yet"
          description="Create the first document of this workspace, or a folder to organise documents in."
        />
      )}
    </div>
  );
}
