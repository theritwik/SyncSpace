import type { WorkspaceSummary } from "@syncspace/shared";
import { LayoutGridIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { formatDate, pluralize } from "@/lib/format";

import { NewWorkspaceButton } from "./new-workspace-button";
import { ROLE_LABELS } from "./roles";
import { WorkspaceAvatar } from "./workspace-avatar";

export function WorkspaceList({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  if (workspaces.length === 0) {
    return (
      <EmptyState
        icon={LayoutGridIcon}
        title="Create your first workspace"
        description="Workspaces keep the work of a team or a project in one place. You do not have any yet."
        action={<NewWorkspaceButton label="Create workspace" />}
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {workspaces.map((workspace) => (
        <li key={workspace.id}>
          <Link
            href={`/w/${workspace.slug}`}
            className="group flex h-full flex-col gap-4 rounded-xl border bg-card p-5 shadow-xs transition-[border-color,box-shadow] outline-none hover:border-foreground/20 hover:shadow-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <div className="flex items-center gap-3">
              <WorkspaceAvatar name={workspace.name} slug={workspace.slug} />
              <div className="min-w-0">
                <h2 className="truncate font-medium">{workspace.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {ROLE_LABELS[workspace.role]} · {pluralize(workspace.memberCount, "member")}
                </p>
              </div>
            </div>
            <p className="mt-auto text-xs text-muted-foreground">
              Created {formatDate(workspace.createdAt)}
            </p>
          </Link>
        </li>
      ))}
    </ul>
  );
}
