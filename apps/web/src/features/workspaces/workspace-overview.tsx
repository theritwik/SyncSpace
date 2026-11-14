import { canManageWorkspace, type WorkspaceSummary } from "@syncspace/shared";
import { FileTextIcon, SettingsIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { formatDate, pluralize } from "@/lib/format";

import { ROLE_LABELS } from "./roles";
import { WorkspaceAvatar } from "./workspace-avatar";

export function WorkspaceOverview({ workspace }: { workspace: WorkspaceSummary }) {
  return (
    <div className="space-y-8">
      <PageHeader
        title={workspace.name}
        description={`${ROLE_LABELS[workspace.role]} · ${pluralize(workspace.memberCount, "member")} · Created ${formatDate(workspace.createdAt)}`}
        leading={<WorkspaceAvatar name={workspace.name} slug={workspace.slug} size="lg" />}
        actions={
          <Button asChild variant="outline">
            <Link href={`/w/${workspace.slug}/settings`}>
              <SettingsIcon aria-hidden />
              {canManageWorkspace(workspace.role) ? "Settings" : "View settings"}
            </Link>
          </Button>
        }
      />

      <section aria-labelledby="documents-heading" className="space-y-3">
        <h2 id="documents-heading" className="text-sm font-medium text-muted-foreground">
          Documents
        </h2>
        {/* Documents are not built yet, so there is deliberately no "new document" button. */}
        <EmptyState
          icon={FileTextIcon}
          title="No documents yet"
          description="Documents are not available in SyncSpace yet. Once they are, the documents of this workspace will appear here."
        />
      </section>
    </div>
  );
}
