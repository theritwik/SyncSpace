import { Server, type Connection } from "@hocuspocus/server";
import type { PrismaClient } from "@syncspace/database";
import { ACCESS_REVOKED_CLOSE_CODE, type CollaborationServerMessage } from "@syncspace/shared";
import { verifyCollaborationToken } from "@syncspace/shared/collaboration-token";
import * as Y from "yjs";
import { z } from "zod";

import { resolveDocumentAccess, type ConnectionIdentity } from "./access.js";
import { loadDocumentState, storeDocumentState } from "./persistence.js";

export interface CollaborationServerOptions {
  db: PrismaClient;
  tokenSecret: string;
  /** Network interface to listen on. */
  host?: string;
  /** Wait this long after the last edit before writing to the database. */
  storeDebounceMs?: number;
  /** While edits keep coming, still write at least this often. */
  storeMaxDebounceMs?: number;
}

/** What the server remembers about a connection. Set once, by `onAuthenticate`. */
type ConnectionContext = ConnectionIdentity;

/** Close code for "your permissions changed, reconnect to pick them up". */
const PERMISSIONS_CHANGED_CLOSE_CODE = 4205;

const documentNameSchema = z.uuid();

/** Rejects a connection attempt; `reason` is passed on to the client. */
function deny(reason: string): Error {
  return Object.assign(new Error(reason), { reason });
}

function encodeSnapshot(document: Y.Doc): string {
  return Buffer.from(Y.encodeSnapshot(Y.snapshot(document))).toString("base64");
}

/**
 * The real-time collaboration server.
 *
 * Each document is a "room" named by the document's id. Hocuspocus speaks the
 * standard Yjs sync and awareness protocols with every client in the room and
 * keeps one authoritative Yjs document per room in memory while it is in use.
 * This file adds what is specific to SyncSpace:
 *
 *   - who may connect, and whether read-only        -> onAuthenticate
 *   - where a document's content comes from          -> onLoadDocument
 *   - when and how it is written to PostgreSQL       -> onStoreDocument
 *   - telling clients what has actually been saved   -> "saved" messages
 *   - dropping connections whose access has ended    -> recheckAccess
 *
 * Presence (who is online, cursor positions) is handled entirely by the Yjs
 * awareness protocol. It lives in memory only and is never stored.
 */
export function createCollaborationServer({
  db,
  tokenSecret,
  host,
  storeDebounceMs = 2_000,
  storeMaxDebounceMs = 10_000,
}: CollaborationServerOptions) {
  /** Documents with changes that have not been written to the database yet. */
  const unsavedDocuments = new Set<string>();
  /** For each loaded document, a snapshot of what the database currently holds. */
  const savedSnapshots = new Map<string, string>();

  function savedMessage(documentName: string): string | null {
    const snapshot = savedSnapshots.get(documentName);
    return snapshot
      ? JSON.stringify({ type: "saved", snapshot } satisfies CollaborationServerMessage)
      : null;
  }

  const server = new Server<ConnectionContext>({
    quiet: true,
    address: host,
    stopOnSignals: false, // main.ts handles shutdown
    debounce: storeDebounceMs,
    maxDebounce: storeMaxDebounceMs,

    /** Plain HTTP requests: a liveness endpoint, nothing else. */
    async onRequest({ request, response }) {
      const isHealthCheck = request.method === "GET" && request.url === "/health";
      response.writeHead(isHealthCheck ? 200 : 404, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify(
          isHealthCheck
            ? {
                status: "ok",
                service: "collaboration",
                timestamp: new Date().toISOString(),
                uptimeSeconds: Math.round(process.uptime()),
              }
            : { error: "Not Found" },
        ),
      );
      // Rejecting without an error tells Hocuspocus the request has been answered.
      return Promise.reject();
    },

    /**
     * Runs for every connection before it can read or write anything.
     * Throwing rejects the connection.
     */
    async onAuthenticate({ token, documentName, connectionConfig }) {
      const payload = verifyCollaborationToken(token, tokenSecret);
      // The token must be genuine, unexpired, and issued for this very room.
      if (
        !payload ||
        !documentNameSchema.safeParse(documentName).success ||
        payload.documentId !== documentName
      ) {
        throw deny("invalid-token");
      }

      const identity: ConnectionIdentity = {
        userId: payload.userId,
        sessionId: payload.sessionId,
        documentId: payload.documentId,
      };
      const access = await resolveDocumentAccess(db, identity);
      if (!access) throw deny("access-denied");

      // Hocuspocus discards document updates from read-only connections, so
      // this is enforced on the server no matter what a client sends.
      connectionConfig.readOnly = !access.canEdit;

      return identity; // becomes the connection's context
    },

    /** Runs once when the first client opens a document that is not in memory. */
    async onLoadDocument({ document, documentName }) {
      await loadDocumentState(db, documentName, document);
      savedSnapshots.set(documentName, encodeSnapshot(document));
    },

    /** Tell a newly connected client what is currently saved. */
    async connected({ connection, documentName }) {
      const message = savedMessage(documentName);
      if (message) connection.sendStateless(message);
    },

    async onChange({ documentName }) {
      unsavedDocuments.add(documentName);
    },

    /**
     * Called by Hocuspocus some time after changes (debounced), when the last
     * client leaves, and on shutdown. If it throws, Hocuspocus keeps the
     * document in memory and tries again after the next change.
     */
    async onStoreDocument({ document, documentName }) {
      if (!unsavedDocuments.has(documentName)) return;

      // Cleared before the write: a change arriving during the write marks
      // the document unsaved again and triggers another store.
      unsavedDocuments.delete(documentName);
      try {
        const stored = await storeDocumentState(db, documentName, document);
        if (!stored) return;
      } catch (error) {
        unsavedDocuments.add(documentName);
        throw error;
      }

      savedSnapshots.set(documentName, encodeSnapshot(document));
      const message = savedMessage(documentName);
      if (message) document.broadcastStateless(message);
    },

    async afterUnloadDocument({ documentName }) {
      unsavedDocuments.delete(documentName);
      savedSnapshots.delete(documentName);
    },
  });

  function closeConnection(connection: Connection, code: number, reason: string): void {
    connection.close({ code, reason });
    connection.webSocket.close(code, reason);
  }

  /**
   * Re-validates every open connection against the database and closes those
   * that should no longer be connected: the user logged out or their session
   * expired, they were removed from the workspace, or the document was
   * deleted. A connection whose write permission changed is closed too, so
   * that the client reconnects and is authenticated with its new permission.
   */
  async function recheckAccess(): Promise<void> {
    for (const document of server.hocuspocus.documents.values()) {
      for (const connection of [...document.getConnections()] as Connection<ConnectionContext>[]) {
        const access = await resolveDocumentAccess(db, connection.context);
        if (!access) {
          closeConnection(connection, ACCESS_REVOKED_CLOSE_CODE, "access-revoked");
        } else if (access.canEdit === connection.readOnly) {
          closeConnection(connection, PERMISSIONS_CHANGED_CLOSE_CODE, "permissions-changed");
        }
      }
    }
  }

  return { server, recheckAccess };
}
