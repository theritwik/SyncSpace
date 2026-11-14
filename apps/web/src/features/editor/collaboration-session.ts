import { HocuspocusProvider, WebSocketStatus } from "@hocuspocus/provider";
import {
  collaborationServerMessageSchema,
  collaborationTokenResponseSchema,
} from "@syncspace/shared";
import * as Y from "yjs";

import { apiRequest } from "@/lib/api-client";

export interface Collaborator {
  /** User id. One person with several tabs open appears once. */
  id: string;
  name: string;
  color: string;
  isCurrentUser: boolean;
}

/**
 * Everything the UI needs to know about the state of a document connection.
 * Each field is a fact reported by the provider or the server, not a guess.
 */
export interface CollaborationStatus {
  connection: "connecting" | "connected" | "disconnected";
  /** The document has been fully loaded from the server at least once. */
  hasSynced: boolean;
  /** Local changes the server has not acknowledged yet. */
  unsyncedChanges: number;
  /**
   * The local document is identical to what the server last reported as
   * written to the database. False from the moment anything changes until the
   * server confirms a save that includes it.
   */
  saved: boolean;
  /** What the server allows this connection to do. Null until authenticated. */
  scope: "read-write" | "readonly" | null;
  /** The server refused access (removed from workspace, document deleted, ...). */
  accessLost: boolean;
  collaborators: Collaborator[];
}

export interface CollaborationSession {
  doc: Y.Doc;
  provider: HocuspocusProvider;
  subscribe: (listener: () => void) => () => void;
  getStatus: () => CollaborationStatus;
  destroy: () => void;
}

export interface SessionOptions {
  documentId: string;
  collaborationUrl: string;
  currentUserId: string;
}

const SAVED_CHECK_DELAY_MS = 250;
const TOKEN_RETRY_DELAY_MS = 3_000;

/**
 * Opens the live connection for one document and tracks its status.
 *
 * - `doc` is this browser tab's copy of the document (a Yjs CRDT).
 * - `provider` keeps it in sync with the collaboration server over a
 *   WebSocket using the Yjs protocols, and reconnects by itself.
 *
 * This is plain TypeScript rather than a React hook so the connection has
 * one clear owner and lifetime. React reads it through `subscribe`/`getStatus`.
 */
export function createCollaborationSession({
  documentId,
  collaborationUrl,
  currentUserId,
}: SessionOptions): CollaborationSession {
  const doc = new Y.Doc();
  const listeners = new Set<() => void>();
  let destroyed = false;

  let status: CollaborationStatus = {
    connection: "connecting",
    hasSynced: false,
    unsyncedChanges: 0,
    saved: false,
    scope: null,
    accessLost: false,
    collaborators: [],
  };

  function update(changes: Partial<CollaborationStatus>) {
    if (destroyed) return;
    // A new object each time something changes, so React can tell by identity.
    status = { ...status, ...changes };
    for (const listener of listeners) listener();
  }

  // --- Authentication -------------------------------------------------------

  /** Set when the API said this user may not open the document (as opposed to a network error). */
  let tokenRefused = false;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Called by the provider every time it (re)connects. A fresh, short-lived
   * token is requested from the API, which checks the session cookie and the
   * user's access to the document.
   */
  async function fetchToken(): Promise<string> {
    const result = await apiRequest("POST", `/documents/${documentId}/collaboration-token`, {
      schema: collaborationTokenResponseSchema,
    });
    if (result.ok) {
      tokenRefused = false;
      return result.data.token;
    }
    // An expired login is handled by apiRequest (redirect to the login page).
    tokenRefused = result.code !== "NETWORK_ERROR" && result.code !== "INTERNAL_ERROR";
    throw new Error(result.message);
  }

  function handleAuthenticationFailed({ reason }: { reason: string }) {
    if (destroyed) return;
    const refusedByServer = reason === "access-denied";

    if (tokenRefused || refusedByServer) {
      // Stop trying: nothing changes until the user's access changes.
      provider.disconnect();
      update({ accessLost: true, scope: null });
      return;
    }
    // Could not get a token (API unreachable) or it expired on the way: try again shortly.
    provider.disconnect();
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (!destroyed) void provider.connect();
    }, TOKEN_RETRY_DELAY_MS);
  }

  // --- "Saved" tracking -----------------------------------------------------

  let lastSavedSnapshot: Y.Snapshot | null = null;
  let savedCheckTimer: ReturnType<typeof setTimeout> | undefined;

  function checkSaved() {
    clearTimeout(savedCheckTimer);
    const saved = lastSavedSnapshot !== null && Y.equalSnapshots(lastSavedSnapshot, Y.snapshot(doc));
    if (saved !== status.saved) update({ saved });
  }

  function handleDocumentUpdate() {
    // Any change may be unsaved; confirm (or not) once things settle.
    if (status.saved) update({ saved: false });
    clearTimeout(savedCheckTimer);
    savedCheckTimer = setTimeout(checkSaved, SAVED_CHECK_DELAY_MS);
  }

  function handleServerMessage({ payload }: { payload: string }) {
    let json: unknown;
    try {
      json = JSON.parse(payload);
    } catch {
      return;
    }
    const message = collaborationServerMessageSchema.safeParse(json);
    if (!message.success) return;

    const bytes = Uint8Array.from(atob(message.data.snapshot), (char) => char.charCodeAt(0));
    lastSavedSnapshot = Y.decodeSnapshot(bytes);
    checkSaved();
  }

  // --- Presence -------------------------------------------------------------

  function readCollaborators(): Collaborator[] {
    const byUser = new Map<string, Collaborator>();
    for (const state of provider.awareness?.getStates().values() ?? []) {
      const user = (state as { user?: Partial<Collaborator> }).user;
      if (typeof user?.id !== "string" || typeof user.name !== "string") continue;
      byUser.set(user.id, {
        id: user.id,
        name: user.name,
        color: typeof user.color === "string" ? user.color : "#64748b",
        isCurrentUser: user.id === currentUserId,
      });
    }
    return [...byUser.values()].sort(
      (a, b) => Number(b.isCurrentUser) - Number(a.isCurrentUser) || a.name.localeCompare(b.name),
    );
  }

  // --- Provider -------------------------------------------------------------

  const provider = new HocuspocusProvider({
    url: collaborationUrl,
    // The room name is the document's id: stable for the document's lifetime.
    name: documentId,
    document: doc,
    token: fetchToken,
    onStatus: ({ status: connection }) => {
      update({
        connection:
          connection === WebSocketStatus.Connected
            ? "connected"
            : connection === WebSocketStatus.Connecting
              ? "connecting"
              : "disconnected",
      });
    },
    onAuthenticated: ({ scope }) => update({ scope, accessLost: false }),
    onAuthenticationFailed: handleAuthenticationFailed,
    onSynced: ({ state }) => {
      if (state) {
        update({ hasSynced: true });
        checkSaved();
      }
    },
    onUnsyncedChanges: ({ number }) => update({ unsyncedChanges: number }),
    onStateless: handleServerMessage,
    onAwarenessChange: () => update({ collaborators: readCollaborators() }),
  });

  doc.on("update", handleDocumentUpdate);

  return {
    doc,
    provider,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getStatus: () => status,
    destroy() {
      destroyed = true;
      clearTimeout(retryTimer);
      clearTimeout(savedCheckTimer);
      doc.off("update", handleDocumentUpdate);
      // Also removes this client's presence (cursor, name) for everyone else.
      provider.destroy();
      doc.destroy();
      listeners.clear();
    },
  };
}

/**
 * Owns "the session that is currently open, if any" outside of React.
 * A component opens and closes it from an effect and reads it with
 * `useSyncExternalStore`, the React API for subscribing to external resources.
 */
export function createSessionHolder() {
  const listeners = new Set<() => void>();
  let current: CollaborationSession | null = null;

  function set(session: CollaborationSession | null) {
    current = session;
    for (const listener of listeners) listener();
  }

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSession: () => current,
    open(options: SessionOptions) {
      current?.destroy();
      set(createCollaborationSession(options));
    },
    close() {
      current?.destroy();
      set(null);
    },
  };
}
