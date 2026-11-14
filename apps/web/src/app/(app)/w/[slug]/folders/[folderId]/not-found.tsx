import { FolderXIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function FolderNotFound() {
  return (
    <EmptyState
      icon={FolderXIcon}
      title="Folder not found"
      description="This folder does not exist, or you do not have access to its workspace."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to all workspaces</Link>
        </Button>
      }
    />
  );
}
