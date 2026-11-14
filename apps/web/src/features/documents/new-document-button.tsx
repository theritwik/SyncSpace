"use client";

import { documentResponseSchema } from "@syncspace/shared";
import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";

interface NewDocumentButtonProps {
  workspaceSlug: string;
  /** Folder to create the document in; null for the top level. */
  folderId: string | null;
}

/** Creates an untitled document and opens it, where it can be given a title. */
export function NewDocumentButton({ workspaceSlug, folderId }: NewDocumentButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const result = await apiRequest("POST", `/workspaces/${workspaceSlug}/documents`, {
      body: { folderId },
      schema: documentResponseSchema,
    });

    if (result.ok) {
      router.push(`/documents/${result.data.document.id}`);
      router.refresh();
      return;
    }
    setPending(false);
    setError(result.message);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button onClick={handleClick} disabled={pending} aria-busy={pending}>
        <PlusIcon aria-hidden />
        {pending ? "Creating…" : "New document"}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
