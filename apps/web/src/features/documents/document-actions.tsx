"use client";

import {
  documentResponseSchema,
  updateDocumentRequestSchema,
  type FolderSummary,
} from "@syncspace/shared";
import { EllipsisIcon, FolderInputIcon, PencilIcon, Trash2Icon } from "lucide-react";
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
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest } from "@/lib/api-client";

import { flattenFolderTree } from "./folder-tree";

interface DocumentActionsProps {
  document: { id: string; title: string; folderId: string | null };
  /** Every folder of the document's workspace (the possible move targets). */
  folders: FolderSummary[];
  /** Where to go after deleting. Set it when the current page shows the deleted document. */
  redirectAfterDelete?: string;
}

type OpenDialog = "rename" | "move" | "delete" | null;

/** The "…" menu of a document: rename, move to a folder, delete. */
export function DocumentActions({ document, folders, redirectAfterDelete }: DocumentActionsProps) {
  const [openDialog, setOpenDialog] = useState<OpenDialog>(null);
  const close = () => setOpenDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${document.title}`}>
            <EllipsisIcon aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onSelect={() => setOpenDialog("rename")}>
            <PencilIcon aria-hidden />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setOpenDialog("move")}>
            <FolderInputIcon aria-hidden />
            Move to…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setOpenDialog("delete")}>
            <Trash2Icon aria-hidden />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={openDialog !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {openDialog === "rename" ? <RenameForm document={document} onDone={close} /> : null}
          {openDialog === "move" ? (
            <MoveForm document={document} folders={folders} onDone={close} />
          ) : null}
          {openDialog === "delete" ? (
            <DeleteForm document={document} redirectTo={redirectAfterDelete} onDone={close} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface FormProps {
  document: DocumentActionsProps["document"];
  onDone: () => void;
}

function RenameForm({ document, onDone }: FormProps) {
  const router = useRouter();
  const [titleError, setTitleError] = useState<string>();
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const parsed = updateDocumentRequestSchema.safeParse({
      title: new FormData(event.currentTarget).get("title"),
    });
    if (!parsed.success) {
      setTitleError(parsed.error.issues[0]?.message);
      return;
    }

    setPending(true);
    const result = await apiRequest("PATCH", `/documents/${document.id}`, {
      body: parsed.data,
      schema: documentResponseSchema,
    });

    if (result.ok) {
      onDone();
      router.refresh();
      return;
    }
    setPending(false);
    setTitleError(result.fieldErrors.title);
    setFormError(result.fieldErrors.title ? null : result.message);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Rename document</DialogTitle>
        <DialogDescription>Give the document a new title.</DialogDescription>
      </DialogHeader>
      <FormError message={formError} />
      <FormField
        id="rename-document-title"
        name="title"
        label="Title"
        defaultValue={document.title}
        autoComplete="off"
        required
        error={titleError}
        onFocus={(event) => event.currentTarget.select()}
      />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending} aria-busy={pending}>
          {pending ? "Saving…" : "Rename"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const TOP_LEVEL = "";

function MoveForm({ document, folders, onDone }: FormProps & { folders: FolderSummary[] }) {
  const router = useRouter();
  const [target, setTarget] = useState(document.folderId ?? TOP_LEVEL);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const unchanged = target === (document.folderId ?? TOP_LEVEL);
  const options = [
    { id: TOP_LEVEL, name: "Top level of the workspace", depth: 0 },
    ...flattenFolderTree(folders).map(({ folder, depth }) => ({
      id: folder.id,
      name: folder.name,
      depth: depth + 1,
    })),
  ];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (unchanged) return;

    setPending(true);
    setError(null);
    const result = await apiRequest("PATCH", `/documents/${document.id}`, {
      body: { folderId: target === TOP_LEVEL ? null : target },
      schema: documentResponseSchema,
    });

    if (result.ok) {
      onDone();
      router.refresh();
      return;
    }
    setPending(false);
    setError(result.fieldErrors.folderId ?? result.message);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Move “{document.title}”</DialogTitle>
        <DialogDescription>
          {folders.length === 0
            ? "This workspace has no folders yet. Create a folder first."
            : "Choose where the document should live."}
        </DialogDescription>
      </DialogHeader>
      <FormError message={error} />
      {/* Native radio buttons: arrow keys move between the options. */}
      <fieldset className="max-h-64 overflow-y-auto rounded-md border p-1">
        <legend className="sr-only">Destination</legend>
        {options.map((option) => (
          <label
            key={option.id}
            className="flex cursor-pointer items-center gap-2.5 rounded-sm px-2 py-1.5 text-sm has-checked:bg-accent has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50"
            style={{ paddingLeft: `${0.5 + option.depth * 1.25}rem` }}
          >
            <input
              type="radio"
              name="destination"
              value={option.id}
              checked={target === option.id}
              onChange={() => setTarget(option.id)}
              className="accent-primary"
            />
            <span className="min-w-0 truncate">{option.name}</span>
            {option.id === (document.folderId ?? TOP_LEVEL) ? (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">Current</span>
            ) : null}
          </label>
        ))}
      </fieldset>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={unchanged || pending} aria-busy={pending}>
          {pending ? "Moving…" : "Move"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DeleteForm({ document, redirectTo, onDone }: FormProps & { redirectTo?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await apiRequest("DELETE", `/documents/${document.id}`);

    if (result.ok) {
      onDone();
      if (redirectTo) router.replace(redirectTo);
      router.refresh();
      return;
    }
    setPending(false);
    setError(result.message);
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>Delete “{document.title}”?</DialogTitle>
        <DialogDescription>
          The document will be removed from this workspace for all members. There is no way to
          restore it from the app yet.
        </DialogDescription>
      </DialogHeader>
      <FormError message={error} />
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={pending} aria-busy={pending}>
          {pending ? "Deleting…" : "Delete document"}
        </Button>
      </DialogFooter>
    </form>
  );
}
