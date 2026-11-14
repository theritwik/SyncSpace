"use client";

import { createFolderRequestSchema, folderResponseSchema } from "@syncspace/shared";
import { FolderPlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";

interface NewFolderButtonProps {
  workspaceSlug: string;
  /** Folder to create the new folder in; null for the top level. */
  parentId: string | null;
  parentName?: string;
}

export function NewFolderButton({ workspaceSlug, parentId, parentName }: NewFolderButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FolderPlusIcon aria-hidden />
          New folder
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a folder</DialogTitle>
          <DialogDescription>
            {parentName
              ? `The folder will be created inside “${parentName}”.`
              : "The folder will be created at the top level of this workspace."}
          </DialogDescription>
        </DialogHeader>
        <NewFolderForm
          workspaceSlug={workspaceSlug}
          parentId={parentId}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function NewFolderForm({
  workspaceSlug,
  parentId,
  onDone,
}: {
  workspaceSlug: string;
  parentId: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [nameError, setNameError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = createFolderRequestSchema.safeParse({
      name: new FormData(event.currentTarget).get("name"),
      parentId,
    });
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      return;
    }

    setPending(true);
    const result = await apiRequest("POST", `/workspaces/${workspaceSlug}/folders`, {
      body: parsed.data,
      schema: folderResponseSchema,
    });

    if (result.ok) {
      onDone();
      router.refresh();
      return;
    }
    setPending(false);
    setNameError(result.fieldErrors.name);
    // A problem with the parent folder is not tied to a visible field.
    setFormError(result.fieldErrors.name ? null : (result.fieldErrors.parentId ?? result.message));
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      <FormError message={formError} />
      <FormField
        id="new-folder-name"
        name="name"
        label="Folder name"
        autoComplete="off"
        required
        error={nameError}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Creating…" : "Create folder"}
        </Button>
      </DialogFooter>
    </form>
  );
}
