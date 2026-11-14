import { CheckIcon, CloudOffIcon, EyeIcon, LoaderIcon, LockIcon, type LucideIcon } from "lucide-react";

import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

import type { Collaborator, CollaborationStatus } from "./collaboration-session";

interface StatusDescription {
  label: string;
  /** Longer explanation, shown as a tooltip and read by screen readers. */
  detail: string;
  icon: LucideIcon;
  tone: "neutral" | "busy" | "ok" | "warning";
}

/**
 * Turns the raw connection facts into the one line shown to the user.
 * Each label states only what is known to be true:
 *
 *   Offline    not connected; edits exist only in this tab
 *   Syncing…   connected; the server has not acknowledged every edit yet
 *   Saving…    the server has every edit, but not all are in the database yet
 *   Saved      this tab's content equals what the server wrote to the database
 */
export function describeStatus(status: CollaborationStatus): StatusDescription {
  if (status.accessLost) {
    return {
      label: "No access",
      detail: "You no longer have access to this document.",
      icon: LockIcon,
      tone: "warning",
    };
  }
  if (!status.hasSynced) {
    return status.connection === "disconnected"
      ? {
          label: "Cannot connect",
          detail: "The collaboration server cannot be reached. Trying again…",
          icon: CloudOffIcon,
          tone: "warning",
        }
      : { label: "Connecting…", detail: "Loading the document.", icon: LoaderIcon, tone: "busy" };
  }
  if (status.connection !== "connected") {
    const hasLocalChanges = status.unsyncedChanges > 0 || !status.saved;
    return {
      label: "Offline",
      detail:
        status.scope === "read-write" && hasLocalChanges
          ? "Your recent changes are only in this browser tab. They will be sent when the connection returns. Keep this tab open."
          : "Reconnecting. What you see may be out of date.",
      icon: CloudOffIcon,
      tone: "warning",
    };
  }
  if (status.scope === "readonly") {
    return {
      label: "View only",
      detail: "You can read this document but not change it. Updates appear live.",
      icon: EyeIcon,
      tone: "neutral",
    };
  }
  if (status.unsyncedChanges > 0) {
    return {
      label: "Syncing…",
      detail: "Sending your changes to the server.",
      icon: LoaderIcon,
      tone: "busy",
    };
  }
  if (!status.saved) {
    return {
      label: "Saving…",
      detail: "The server has your changes and is writing them to the database.",
      icon: LoaderIcon,
      tone: "busy",
    };
  }
  return {
    label: "Saved",
    detail: "All changes are stored in the database.",
    icon: CheckIcon,
    tone: "ok",
  };
}

export function EditorStatus({ status }: { status: CollaborationStatus }) {
  const { label, detail, icon: Icon, tone } = describeStatus(status);

  return (
    // A polite live region: status changes are announced without interrupting.
    <p
      role="status"
      title={detail}
      data-status={label}
      className={cn(
        "flex items-center gap-1.5 text-xs font-medium",
        tone === "warning" ? "text-amber-700" : "text-muted-foreground",
      )}
    >
      <Icon aria-hidden className={cn("size-3.5", tone === "busy" && "animate-spin")} />
      {label}
      <span className="sr-only">. {detail}</span>
    </p>
  );
}

const MAX_VISIBLE = 5;

export function CollaboratorList({ collaborators }: { collaborators: Collaborator[] }) {
  if (collaborators.length === 0) return null;
  const visible = collaborators.slice(0, MAX_VISIBLE);
  const hidden = collaborators.length - visible.length;

  return (
    <ul aria-label="People in this document" className="flex items-center -space-x-1.5">
      {visible.map((collaborator) => (
        <li
          key={collaborator.id}
          title={collaborator.isCurrentUser ? `${collaborator.name} (you)` : collaborator.name}
          style={{ backgroundColor: collaborator.color }}
          className="flex size-7 items-center justify-center rounded-full text-[0.625rem] font-semibold text-white ring-2 ring-background"
        >
          <span aria-hidden>{initials(collaborator.name)}</span>
          <span className="sr-only">
            {collaborator.name}
            {collaborator.isCurrentUser ? " (you)" : ""}
          </span>
        </li>
      ))}
      {hidden > 0 ? (
        <li className="flex size-7 items-center justify-center rounded-full bg-muted text-[0.625rem] font-semibold ring-2 ring-background">
          +{hidden}
          <span className="sr-only"> more</span>
        </li>
      ) : null}
    </ul>
  );
}
