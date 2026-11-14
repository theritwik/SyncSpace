"use client";

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

export function DeleteWorkspace({ slug, name }: { slug: string; name: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete workspace</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete “{name}”?</DialogTitle>
          <DialogDescription>
            This permanently deletes the workspace and removes all of its members. It cannot be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DeleteWorkspaceForm slug={slug} name={name} onCancel={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function DeleteWorkspaceForm({
  slug,
  name,
  onCancel,
}: {
  slug: string;
  name: string;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Typing the name guards against deleting the wrong workspace by reflex.
  const confirmed = confirmation.trim() === name;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed) return;

    setPending(true);
    setError(null);
    const result = await apiRequest("DELETE", `/workspaces/${slug}`);

    if (result.ok) {
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    setPending(false);
    setError(result.message);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <FormError message={error} />
      <FormField
        id="delete-confirmation"
        name="confirmation"
        label={`Type “${name}” to confirm`}
        autoComplete="off"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="destructive"
          disabled={!confirmed || pending}
          aria-busy={pending}
        >
          {pending ? "Deleting…" : "Delete workspace"}
        </Button>
      </DialogFooter>
    </form>
  );
}
