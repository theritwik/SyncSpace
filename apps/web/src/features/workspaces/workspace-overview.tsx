import {
  canManageWorkspace,
  type DocumentSummary,
  type FolderSummary,
  type WorkspaceSummary,
} from "@syncspace/shared";
import { FileTextIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DocumentList } from "@/features/documents/document-list";
import { NewDocumentButton } from "@/features/documents/new-document-button";
import { formatDate, pluralize } from "@/lib/format";

import { ROLE_LABELS } from "./roles";
import { WorkspaceAvatar } from "./workspace-avatar";

interface WorkspaceOverviewProps {
  workspace: WorkspaceSummary;
  /** The most recently updated documents of the workspace (already limited). */
  recentDocuments: DocumentSummary[];
  folders: FolderSummary[];
}

export function WorkspaceOverview({ workspace, recentDocuments, folders }: WorkspaceOverviewProps) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={workspace.name}
        description={`${ROLE_LABELS[workspace.role]} · ${pluralize(workspace.memberCount, "member")} · Created ${formatDate(workspace.createdAt)}`}
        leading={<WorkspaceAvatar name={workspace.name} slug={workspace.slug} size="lg" />}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <Button asChild variant="outline">
              <Link href={`/w/${workspace.slug}/settings`}>
                <SettingsIcon aria-hidden />
                {canManageWorkspace(workspace.role) ? "Settings" : "View settings"}
              </Link>
            </Button>
            <NewDocumentButton workspaceSlug={workspace.slug} folderId={null} />
          </div>
        }
      />

      <section aria-labelledby="recent-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 id="recent-heading" className="text-sm font-medium text-muted-foreground">
            Recently updated
          </h2>
          {recentDocuments.length > 0 ? (
            <Link
              href={`/w/${workspace.slug}/documents`}
              className="rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              All documents
            </Link>
          ) : null}
        </div>
        {recentDocuments.length > 0 ? (
          <DocumentList documents={recentDocuments} folders={folders} showLocation />
        ) : (
          <EmptyState
            icon={FileTextIcon}
            title="No documents yet"
            description="Documents you and other members create in this workspace will appear here."
          />
        )}
      </section>
    </div>
  );
}
