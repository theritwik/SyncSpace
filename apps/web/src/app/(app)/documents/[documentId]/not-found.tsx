import { FileXIcon } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export default function DocumentNotFound() {
  return (
    <EmptyState
      icon={FileXIcon}
      title="Document not found"
      description="This document does not exist, was deleted, or belongs to a workspace you are not a member of."
      action={
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to all workspaces</Link>
        </Button>
      }
    />
  );
}
