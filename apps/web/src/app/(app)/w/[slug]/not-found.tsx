import { SearchXIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function WorkspaceNotFound() {
  return (
    <EmptyState
      icon={SearchXIcon}
      title="Workspace not found"
      description="This workspace does not exist, or you are not a member of it."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to all workspaces</Link>
        </Button>
      }
    />
  );
}
