"use client";

import { updateWorkspaceRequestSchema, workspaceResponseSchema } from "@syncspace/shared";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/api-client";

type Status = { kind: "idle" } | { kind: "saved" } | { kind: "error"; message: string };

export function RenameWorkspaceForm({ slug, name }: { slug: string; name: string }) {
  const router = useRouter();
  const [nameError, setNameError] = useState<string>();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "idle" });

    const parsed = updateWorkspaceRequestSchema.safeParse(
      Object.fromEntries(new FormData(event.currentTarget)),
    );
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message);
      return;
    }
    setNameError(undefined);

    setPending(true);
    const result = await apiRequest("PATCH", `/workspaces/${slug}`, {
      body: parsed.data,
      schema: workspaceResponseSchema,
    });
    setPending(false);

    if (result.ok) {
      setStatus({ kind: "saved" });
      // Re-render server components so the sidebar and titles show the new name.
      router.refresh();
    } else {
      setNameError(result.fieldErrors.name);
      setStatus(
        result.fieldErrors.name ? { kind: "idle" } : { kind: "error", message: result.message },
      );
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid max-w-md gap-4">
      <FormField
        id="workspace-name"
        name="name"
        label="Workspace name"
        defaultValue={name}
        autoComplete="off"
        required
        error={nameError}
        onChange={() => setStatus({ kind: "idle" })}
      />
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <p role="status" className="text-sm">
          {status.kind === "saved" ? (
            <span className="text-muted-foreground">Saved.</span>
          ) : status.kind === "error" ? (
            <span className="text-destructive">{status.message}</span>
          ) : null}
        </p>
      </div>
    </form>
  );
}
