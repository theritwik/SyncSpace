import {
  canDeleteWorkspace,
  canManageWorkspace,
  type WorkspaceMemberSummary,
  type WorkspaceSummary,
} from "@syncspace/shared";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { DeleteWorkspace } from "./delete-workspace";
import { MembersList } from "./members-list";
import { RenameWorkspaceForm } from "./rename-workspace-form";

interface WorkspaceSettingsProps {
  workspace: WorkspaceSummary;
  members: WorkspaceMemberSummary[];
  currentUserId: string;
}

export function WorkspaceSettings({ workspace, members, currentUserId }: WorkspaceSettingsProps) {
  // The API enforces these rules; here they only decide which controls to show.
  const canManage = canManageWorkspace(workspace.role);
  const canDelete = canDeleteWorkspace(workspace.role);

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" description={`Manage the “${workspace.name}” workspace.`} />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>General</h2>
          </CardTitle>
          <CardDescription>
            {canManage
              ? "The name is shown in the sidebar and to every member."
              : "Only owners and admins can change these settings."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            // The key resets the form's initial value after a successful rename.
            <RenameWorkspaceForm key={workspace.name} slug={workspace.slug} name={workspace.name} />
          ) : (
            <dl className="text-sm">
              <dt className="text-muted-foreground">Workspace name</dt>
              <dd className="mt-1 font-medium">{workspace.name}</dd>
            </dl>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Members</h2>
          </CardTitle>
          <CardDescription>
            {members.length === 1 ? "1 person" : `${members.length} people`} can access this workspace. Inviting members is
            not available yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MembersList members={members} currentUserId={currentUserId} />
        </CardContent>
      </Card>

      {canDelete ? (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle>
              <h2>Delete workspace</h2>
            </CardTitle>
            <CardDescription>
              Permanently delete this workspace and remove all of its members. This cannot be
              undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteWorkspace slug={workspace.slug} name={workspace.name} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
