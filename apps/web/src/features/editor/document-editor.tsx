"use client";

import { COLLABORATION_FIELD } from "@syncspace/shared";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState, useSyncExternalStore } from "react";

import { Skeleton } from "@/components/ui/skeleton";

import { createSessionHolder, type CollaborationSession } from "./collaboration-session";
import { CollaboratorList, describeStatus, EditorStatus } from "./editor-status";
import { EditorToolbar } from "./editor-toolbar";
import { colorForUser } from "./user-color";

interface DocumentEditorProps {
  documentId: string;
  /** WebSocket URL of the collaboration service. */
  collaborationUrl: string;
  user: { id: string; name: string };
}

/**
 * The collaborative editor of one document.
 *
 * The document's content is not passed in as a prop and is never sent to the
 * REST API. It lives in a Yjs document that the collaboration session keeps
 * in sync with the server; the editor simply displays and edits that.
 */
export function DocumentEditor({ documentId, collaborationUrl, user }: DocumentEditorProps) {
  const [holder] = useState(createSessionHolder);

  // The connection is an external resource: open it when the editor appears
  // and close it when the editor goes away or shows another document.
  useEffect(() => {
    holder.open({ documentId, collaborationUrl, currentUserId: user.id });
    return () => holder.close();
  }, [holder, documentId, collaborationUrl, user.id]);

  const session = useSyncExternalStore(holder.subscribe, holder.getSession, () => null);

  if (!session) return <EditorSkeleton />;

  // A new session gets a new editor, so the two can never be mismatched.
  return <ConnectedEditor key={session.doc.guid} session={session} user={user} />;
}

function ConnectedEditor({
  session,
  user,
}: {
  session: CollaborationSession;
  user: DocumentEditorProps["user"];
}) {
  const status = useSyncExternalStore(session.subscribe, session.getStatus, session.getStatus);

  // Editing needs the server's permission, and waits for the first full load:
  // typing into a not-yet-loaded document would insert text in the wrong place.
  const canEdit = status.scope === "read-write" && status.hasSynced && !status.accessLost;

  const editor = useEditor({
    // Rendered on the client only; the content comes from the live connection.
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({
        // Collaboration brings its own undo/redo that only reverts this user's
        // changes. The regular history would also undo other people's edits.
        undoRedo: false,
        link: false,
      }),
      Collaboration.configure({ document: session.doc, field: COLLABORATION_FIELD }),
      CollaborationCaret.configure({
        provider: session.provider,
        user: { id: user.id, name: user.name, color: colorForUser(user.id) },
      }),
    ],
    editorProps: {
      attributes: {
        class: "document-content",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Document content",
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(canEdit);
  }, [editor, canEdit]);

  // Warn before closing the tab while edits exist only here.
  const hasUnsentChanges =
    status.scope === "read-write" &&
    (status.unsyncedChanges > 0 || (status.connection !== "connected" && !status.saved));
  useEffect(() => {
    if (!hasUnsentChanges) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsentChanges]);

  const { label, detail } = describeStatus(status);
  const isLoading = !status.hasSynced && !status.accessLost;
  const showNotice =
    status.accessLost ||
    (status.hasSynced && status.connection !== "connected") ||
    (!status.hasSynced && status.connection === "disconnected");

  return (
    <section aria-label="Editor" className="overflow-hidden rounded-xl border bg-card shadow-xs">
      <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
        <EditorStatus status={status} />
        <CollaboratorList collaborators={status.collaborators} />
      </div>

      {editor && status.scope !== "readonly" ? (
        <EditorToolbar editor={editor} disabled={!canEdit} />
      ) : null}

      {showNotice ? (
        <p
          role={status.accessLost ? "alert" : undefined}
          className="border-b bg-amber-50 px-4 py-2 text-sm text-amber-900"
        >
          <span className="font-medium">{label}.</span> {detail}
        </p>
      ) : null}

      <div className="relative min-h-96" aria-busy={isLoading}>
        {isLoading ? (
          <div className="absolute inset-0 z-10 bg-card p-6 sm:px-10" role="status">
            <span className="sr-only">Loading document…</span>
            <EditorContentSkeleton />
          </div>
        ) : null}
        <EditorContent editor={editor} />
      </div>
    </section>
  );
}

function EditorContentSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-5 w-full" />
      <Skeleton className="h-5 w-5/6" />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="min-h-96 rounded-xl border bg-card p-6 shadow-xs sm:px-10" role="status">
      <span className="sr-only">Loading editor…</span>
      <EditorContentSkeleton />
    </div>
  );
}
