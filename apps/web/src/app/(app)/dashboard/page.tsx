import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { listWorkspaces } from "@/features/workspaces/data";
import { NewWorkspaceButton } from "@/features/workspaces/new-workspace-button";
import { WorkspaceList } from "@/features/workspaces/workspace-list";

export const metadata: Metadata = { title: "Workspaces" };

export default async function DashboardPage() {
  const workspaces = await listWorkspaces();

  return (
    <div className="space-y-8">
      <PageHeader
        title="Workspaces"
        description="Every workspace you are a member of."
        actions={workspaces.length > 0 ? <NewWorkspaceButton /> : null}
      />
      <WorkspaceList workspaces={workspaces} />
    </div>
  );
}
