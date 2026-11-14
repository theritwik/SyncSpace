"use client";

import {
  DOCUMENT_TITLE_MAX_LENGTH,
  documentResponseSchema,
  updateDocumentRequestSchema,
} from "@syncspace/shared";
import { useRouter } from "next/navigation";
import { useState, type KeyboardEvent } from "react";

import { apiRequest } from "@/lib/api-client";

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/**
 * The document title, editable in place. It saves when the field loses focus
 * or Enter is pressed; Escape restores the last saved title.
 */
export function DocumentTitle({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [savedTitle, setSavedTitle] = useState(title);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function save() {
    const parsed = updateDocumentRequestSchema.safeParse({ title: value });
    if (!parsed.success || !parsed.data.title) {
      setValue(savedTitle);
      setStatus({ kind: "error", message: "A document needs a title. The change was not saved." });
      return;
    }
    const nextTitle = parsed.data.title;
    setValue(nextTitle);
    if (nextTitle === savedTitle) return;

    setStatus({ kind: "saving" });
    const result = await apiRequest("PATCH", `/documents/${documentId}`, {
      body: { title: nextTitle },
      schema: documentResponseSchema,
    });

    if (result.ok) {
      setSavedTitle(nextTitle);
      setStatus({ kind: "saved" });
      // Re-render server components so breadcrumbs and metadata show the new title.
      router.refresh();
    } else {
      setStatus({ kind: "error", message: result.fieldErrors.title ?? result.message });
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur(); // saving happens in onBlur
    } else if (event.key === "Escape") {
      setValue(savedTitle);
      setStatus({ kind: "idle" });
    }
  }

  return (
    <div className="min-w-0 flex-1">
      {/* The input is the visible title; the heading gives the page its structure. */}
      <h1 className="sr-only">{savedTitle}</h1>
      <input
        aria-label="Document title"
        value={value}
        maxLength={DOCUMENT_TITLE_MAX_LENGTH}
        onChange={(event) => {
          setValue(event.target.value);
          setStatus({ kind: "idle" });
        }}
        onBlur={save}
        onKeyDown={handleKeyDown}
        className="-mx-2 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-2 py-1 text-3xl font-semibold tracking-tight outline-none hover:border-input focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <p role="status" className="min-h-5 px-0.5 text-xs">
        {status.kind === "saving" ? (
          <span className="text-muted-foreground">Saving…</span>
        ) : status.kind === "saved" ? (
          <span className="text-muted-foreground">Title saved.</span>
        ) : status.kind === "error" ? (
          <span className="text-destructive">{status.message}</span>
        ) : null}
      </p>
    </div>
  );
}
