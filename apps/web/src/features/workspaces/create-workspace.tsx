"use client";

import { createWorkspaceRequestSchema, workspaceResponseSchema } from "@syncspace/shared";
import { useRouter } from "next/navigation";
import { createContext, use, useState, type FormEvent, type ReactNode } from "react";

import { FormError, FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/api-client";

const CreateWorkspaceContext = createContext<(() => void) | null>(null);

/**
 * Renders the one "create workspace" dialog of the app and lets any component
 * below it open that dialog (sidebar, search, empty state, ...).
 */
export function CreateWorkspaceProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  return (
    <CreateWorkspaceContext value={() => setOpen(true)}>
      {children}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create a workspace</DialogTitle>
            <DialogDescription>
              A workspace is a separate space for a team or a project. You will be its owner.
            </DialogDescription>
          </DialogHeader>
          {/* Mounted only while open, so the form starts empty every time. */}
          <CreateWorkspaceForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </CreateWorkspaceContext>
  );
}

/** Returns a function that opens the "create workspace" dialog. */
export function useCreateWorkspace(): () => void {
  const openDialog = use(CreateWorkspaceContext);
  if (!openDialog) {
    throw new Error("useCreateWorkspace must be used inside CreateWorkspaceProvider");
  }
  return openDialog;
}

function CreateWorkspaceForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [nameError, setNameError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem("name");
    setFormError(null);

    const parsed = createWorkspaceRequestSchema.safeParse(Object.fromEntries(new FormData(form)));
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      if (nameInput instanceof HTMLElement) nameInput.focus();
      return;
    }

    setPending(true);
    const result = await apiRequest("POST", "/workspaces", {
      body: parsed.data,
      schema: workspaceResponseSchema,
    });

    if (result.ok) {
      onDone();
      router.push(`/w/${result.data.workspace.slug}`);
      // Re-render server components so the sidebar lists the new workspace.
      router.refresh();
      return;
    }

    setPending(false);
    setNameError(result.fieldErrors.name);
    setFormError(result.fieldErrors.name ? null : result.message);
    if (nameInput instanceof HTMLElement) nameInput.focus();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      <FormError message={formError} />
      <FormField
        id="new-workspace-name"
        name="name"
        label="Workspace name"
        placeholder="e.g. Product team"
        autoComplete="off"
        required
        error={nameError}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Creating…" : "Create workspace"}
        </Button>
      </DialogFooter>
    </form>
  );
}
