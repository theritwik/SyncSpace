import { HocuspocusProvider } from "@hocuspocus/provider";
import {
  createDatabaseClient,
  type PrismaClient,
  type WorkspaceRole,
} from "@syncspace/database";
import {
  ACCESS_REVOKED_CLOSE_CODE,
  collaborationServerMessageSchema,
  COLLABORATION_FIELD,
} from "@syncspace/shared";
import { signCollaborationToken } from "@syncspace/shared/collaboration-token";
import { afterAll, afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import * as Y from "yjs";

import { createCollaborationServer } from "./collaboration-server.js";

// Integration tests: a real Hocuspocus server on a random port, the real
// PostgreSQL test database, and real @hocuspocus/provider clients talking to
// it over WebSockets. Each client has its own Y.Doc, exactly like two browsers.

const SECRET = "test-secret-test-secret-test-secret-1234";
const STORE_DEBOUNCE_MS = 50;

const db: PrismaClient = createDatabaseClient(inject("testDatabaseUrl"));

type CollaborationServer = ReturnType<typeof createCollaborationServer>;
let collaboration: CollaborationServer;
let url: string;
const clients: Client[] = [];

interface TestUser {
  id: string;
  sessionId: string;
}

let workspaceId: string;
let documentId: string;
let owner: TestUser;
let member: TestUser;

async function startServer(): Promise<void> {
  collaboration = createCollaborationServer({
    db,
    tokenSecret: SECRET,
    host: "127.0.0.1",
    storeDebounceMs: STORE_DEBOUNCE_MS,
    storeMaxDebounceMs: 200,
  });
  // Port 0 would be replaced by the default, so let the OS pick via a free high port.
  await collaboration.server.listen(await freePort());
  url = `ws://127.0.0.1:${collaboration.server.address.port}`;
}

async function freePort(): Promise<number> {
  const { createServer } = await import("node:net");
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
}

async function createUser(name: string, role?: WorkspaceRole): Promise<TestUser> {
  const user = await db.user.create({
    data: {
      name,
      email: `${name.toLowerCase()}@example.com`,
      passwordHash: "not-used",
      sessions: {
        create: { tokenHash: `hash-${name}`, expiresAt: new Date(Date.now() + 3_600_000) },
      },
      ...(role ? { memberships: { create: { workspaceId, role } } } : {}),
    },
    include: { sessions: true },
  });
  return { id: user.id, sessionId: user.sessions[0]!.id };
}

function tokenFor(user: TestUser, document = documentId, expiresInSeconds = 60): string {
  return signCollaborationToken(
    {
      userId: user.id,
      sessionId: user.sessionId,
      documentId: document,
      exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    },
    SECRET,
  );
}

interface Client {
  provider: HocuspocusProvider;
  doc: Y.Doc;
  text: Y.Text;
  /** Reasons of failed authentications. */
  denied: string[];
  /** Snapshots announced by the server as saved. */
  saved: string[];
  closeCodes: number[];
}

interface ConnectOptions {
  document?: string;
  token?: string | (() => string);
  /** Reuse a Y.Doc, e.g. to simulate a client that kept local state. */
  doc?: Y.Doc;
}

function connect(user: TestUser, options: ConnectOptions = {}): Client {
  const doc = options.doc ?? new Y.Doc();
  const client: Client = {
    doc,
    text: doc.getText("test"),
    denied: [],
    saved: [],
    closeCodes: [],
    provider: new HocuspocusProvider({
      url,
      name: options.document ?? documentId,
      document: doc,
      token: options.token ?? (() => tokenFor(user, options.document ?? documentId)),
      onAuthenticationFailed: ({ reason }) => client.denied.push(reason),
      onClose: ({ event }) => client.closeCodes.push(event.code),
      onStateless: ({ payload }) => {
        const message = collaborationServerMessageSchema.safeParse(JSON.parse(payload));
        if (message.success) client.saved.push(message.data.snapshot);
      },
    }),
  };
  clients.push(client);
  return client;
}

async function waitFor(condition: () => boolean | Promise<boolean>, what: string, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const synced = (client: Client) => waitFor(() => client.provider.isSynced, "initial sync");

/** True when the client's document equals the last state the server reported as saved. */
function isSaved(client: Client): boolean {
  const last = client.saved.at(-1);
  return (
    last !== undefined &&
    Y.equalSnapshots(Y.decodeSnapshot(Buffer.from(last, "base64")), Y.snapshot(client.doc))
  );
}

async function storedText(document = documentId): Promise<string | null> {
  const content = await db.documentContent.findUnique({ where: { documentId: document } });
  if (!content) return null;
  const doc = new Y.Doc();
  Y.applyUpdate(doc, content.state);
  return doc.getText("test").toString();
}

beforeEach(async () => {
  await db.workspace.deleteMany();
  await db.user.deleteMany();

  const workspace = await db.workspace.create({ data: { name: "Acme", slug: "acme" } });
  workspaceId = workspace.id;
  owner = await createUser("Owner", "OWNER");
  member = await createUser("Member", "MEMBER");
  documentId = (
    await db.document.create({ data: { title: "Doc", workspaceId, createdById: owner.id } })
  ).id;

  await startServer();
});

afterEach(async () => {
  for (const client of clients.splice(0)) client.provider.destroy();
  await collaboration.server.destroy();
});

afterAll(async () => {
  await db.$disconnect();
});

describe("health endpoint", () => {
  it("answers GET /health and nothing else over plain HTTP", async () => {
    const base = url.replace("ws://", "http://");

    const health = await fetch(`${base}/health`);
    const other = await fetch(`${base}/documents`);

    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ status: "ok", service: "collaboration" });
    expect(other.status).toBe(404);
  });
});

describe("synchronisation", () => {
  it("delivers one client's edits to another client in the same room", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);

    alice.text.insert(0, "Hello from Alice");

    await waitFor(() => bob.text.toString() === "Hello from Alice", "bob receives the edit");
  });

  it("converges when both clients edit at the same time", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);

    // No awaiting in between: neither has seen the other's edit when it makes its own.
    alice.text.insert(0, "AAA");
    bob.text.insert(0, "BBB");
    for (let i = 0; i < 20; i++) {
      alice.text.insert(alice.text.length, `a${i} `);
      bob.text.insert(0, `b${i} `);
    }

    await waitFor(
      () => alice.text.length === bob.text.length && alice.text.toString() === bob.text.toString(),
      "both documents are identical",
    );
    const result = alice.text.toString();
    expect(result).toContain("AAA");
    expect(result).toContain("BBB");
    expect(result).toContain("a19 ");
    expect(result).toContain("b19 ");
  });

  it("keeps rooms separate: edits never leak into another document", async () => {
    const otherDocument = (
      await db.document.create({ data: { title: "Other", workspaceId } })
    ).id;
    const alice = connect(owner);
    const bob = connect(member, { document: otherDocument });
    await Promise.all([synced(alice), synced(bob)]);

    alice.text.insert(0, "only in the first document");
    await waitFor(() => alice.provider.unsyncedChanges === 0, "alice's edit is acknowledged");
    await new Promise((resolve) => setTimeout(resolve, 150));

    expect(bob.text.toString()).toBe("");
  });

  it("synchronises the shared type the editor uses (an XML fragment)", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);

    const paragraph = new Y.XmlElement("paragraph");
    paragraph.insert(0, [new Y.XmlText("Typed in the editor")]);
    alice.doc.getXmlFragment(COLLABORATION_FIELD).insert(0, [paragraph]);

    await waitFor(
      () => bob.doc.getXmlFragment(COLLABORATION_FIELD).toString().includes("Typed in the editor"),
      "bob receives the editor content",
    );
  });
});

describe("presence (awareness)", () => {
  it("shares cursor/user state between clients and removes it on disconnect", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);

    alice.provider.awareness!.setLocalStateField("user", { name: "Alice", color: "#2563eb" });

    const aliceId = alice.doc.clientID;
    await waitFor(
      () => bob.provider.awareness!.getStates().get(aliceId)?.user?.name === "Alice",
      "bob sees alice's presence",
    );

    alice.provider.destroy();

    await waitFor(
      () => !bob.provider.awareness!.getStates().has(aliceId),
      "alice's presence is removed for bob",
    );
  });

  it("removes presence when a connection drops without saying goodbye", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);
    alice.provider.awareness!.setLocalStateField("user", { name: "Alice" });
    const aliceId = alice.doc.clientID;
    await waitFor(() => bob.provider.awareness!.getStates().has(aliceId), "bob sees alice");

    // Kill the socket from the server side, as a network failure would.
    for (const document of collaboration.server.hocuspocus.documents.values()) {
      for (const connection of document.getConnections()) {
        if (connection.context.userId === owner.id) connection.webSocket.close(4000, "test");
      }
    }

    await waitFor(() => !bob.provider.awareness!.getStates().has(aliceId), "presence cleaned up");
  });

  it("never writes presence to the database", async () => {
    const alice = connect(owner);
    await synced(alice);
    alice.provider.awareness!.setLocalStateField("user", { name: "PRESENCE-MARKER" });
    alice.text.insert(0, "content");
    await waitFor(() => isSaved(alice), "content is saved");

    const content = await db.documentContent.findUniqueOrThrow({ where: { documentId } });

    expect(Buffer.from(content.state).toString("latin1")).not.toContain("PRESENCE-MARKER");
    expect(await storedText()).toBe("content");
  });
});

describe("persistence", () => {
  it("writes the document to PostgreSQL and tells clients when it is saved", async () => {
    const alice = connect(owner);
    await synced(alice);
    // An empty, never-edited document is reported as saved and stores nothing.
    await waitFor(() => isSaved(alice), "empty document counts as saved");
    expect(await storedText()).toBeNull();
    const before = await db.document.findUniqueOrThrow({ where: { id: documentId } });

    alice.text.insert(0, "Saved text");
    expect(isSaved(alice)).toBe(false);

    await waitFor(() => isSaved(alice), "server confirms the save");
    expect(await storedText()).toBe("Saved text");
    const after = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  it("does not touch the database when a document is only opened", async () => {
    const before = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    const alice = connect(owner);
    await synced(alice);

    alice.provider.destroy();
    await waitFor(() => collaboration.server.hocuspocus.getDocumentsCount() === 0, "document unloads");

    expect(await storedText()).toBeNull();
    expect((await db.document.findUniqueOrThrow({ where: { id: documentId } })).updatedAt).toEqual(
      before.updatedAt,
    );
  });

  it("recovers the content after the collaboration server restarts", async () => {
    const alice = connect(owner);
    await synced(alice);
    alice.text.insert(0, "Survives a restart");
    await waitFor(() => isSaved(alice), "content is saved");

    for (const client of clients.splice(0)) client.provider.destroy();
    await collaboration.server.destroy();
    await startServer(); // a brand-new server process as far as state is concerned

    const bob = connect(member);
    await synced(bob);

    expect(bob.text.toString()).toBe("Survives a restart");
    // What was loaded is reported as saved, without any new write.
    await waitFor(() => isSaved(bob), "loaded content is reported as saved");
  });

  it("saves unsaved edits when the server shuts down", async () => {
    await collaboration.server.destroy();
    collaboration = createCollaborationServer({
      db,
      tokenSecret: SECRET,
      host: "127.0.0.1",
      storeDebounceMs: 60_000, // would not save by itself during this test
      storeMaxDebounceMs: 60_000,
    });
    await collaboration.server.listen(await freePort());
    url = `ws://127.0.0.1:${collaboration.server.address.port}`;

    const alice = connect(owner);
    await synced(alice);
    alice.text.insert(0, "Typed just before shutdown");
    await waitFor(() => alice.provider.unsyncedChanges === 0, "server received the edit");
    expect(await storedText()).toBeNull();

    await collaboration.server.destroy();

    expect(await storedText()).toBe("Typed just before shutdown");
  });

  it("does not duplicate content when several clients open a stored document at once", async () => {
    const first = connect(owner);
    await synced(first);
    first.text.insert(0, "Once");
    await waitFor(() => isSaved(first), "content is saved");
    first.provider.destroy();
    await waitFor(() => collaboration.server.hocuspocus.getDocumentsCount() === 0, "document unloads");

    const reopened = [connect(owner), connect(member), connect(owner)];
    await Promise.all(reopened.map(synced));

    expect(reopened.map((client) => client.text.toString())).toEqual(["Once", "Once", "Once"]);
    expect(await storedText()).toBe("Once");
  });

  it("merges with, rather than overwrites, a newer state already in the database", async () => {
    const alice = connect(owner);
    await synced(alice);

    // Something else (e.g. another server instance) stored content in the meantime.
    const foreign = new Y.Doc();
    foreign.getText("test").insert(0, "from elsewhere ");
    await db.documentContent.create({
      data: { documentId, state: new Uint8Array(Y.encodeStateAsUpdate(foreign)) },
    });

    alice.text.insert(0, "from alice ");
    await waitFor(() => isSaved(alice), "save completes");

    const stored = await storedText();
    expect(stored).toContain("from elsewhere ");
    expect(stored).toContain("from alice ");
    // The merged content also reaches the connected client.
    expect(alice.text.toString()).toBe(stored);
  });
});

describe("reconnection", () => {
  it("merges edits made while offline with edits made by others meanwhile", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);
    alice.text.insert(0, "start ");
    await waitFor(() => bob.text.toString() === "start ", "initial content shared");

    bob.provider.disconnect();
    await waitFor(() => !bob.provider.isSynced, "bob is offline");
    bob.text.insert(bob.text.length, "[bob offline] ");
    alice.text.insert(alice.text.length, "[alice online] ");
    expect(bob.provider.hasUnsyncedChanges).toBe(true);

    await bob.provider.connect();

    await waitFor(
      () => alice.text.toString() === bob.text.toString() && bob.text.toString().includes("[alice online]"),
      "documents converge after reconnect",
    );
    expect(alice.text.toString()).toContain("[bob offline] ");
    await waitFor(() => bob.provider.unsyncedChanges === 0, "bob has nothing left to sync");
  });

  it("resynchronises a client whose connection was dropped by the server", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);

    for (const document of collaboration.server.hocuspocus.documents.values()) {
      for (const connection of document.getConnections()) {
        if (connection.context.userId === member.id) connection.webSocket.close(4000, "test");
      }
    }
    await waitFor(() => bob.closeCodes.length > 0, "bob notices the drop");
    alice.text.insert(0, "written while bob was reconnecting");

    // The provider reconnects by itself, with a freshly issued token.
    await waitFor(
      () => bob.text.toString() === "written while bob was reconnecting",
      "bob catches up after automatic reconnect",
      10_000,
    );
  });
});

describe("authentication and authorisation", () => {
  async function expectDenied(client: Client, reason: string) {
    await waitFor(() => client.denied.length > 0, "connection is rejected");
    expect(client.denied[0]).toBe(reason);
    expect(client.provider.isSynced).toBe(false);
  }

  it("rejects a connection without a valid token", async () => {
    await expectDenied(connect(owner, { token: "" }), "invalid-token");
    await expectDenied(connect(owner, { token: "not.a-token" }), "invalid-token");
    await expectDenied(
      connect(owner, {
        token: signCollaborationToken(
          {
            userId: owner.id,
            sessionId: owner.sessionId,
            documentId,
            exp: Math.floor(Date.now() / 1000) + 60,
          },
          "a-different-secret-a-different-secret-12",
        ),
      }),
      "invalid-token",
    );
  });

  it("rejects an expired token", async () => {
    await expectDenied(connect(owner, { token: tokenFor(owner, documentId, -1) }), "invalid-token");
  });

  it("rejects a token issued for a different document", async () => {
    const otherDocument = (await db.document.create({ data: { title: "Other", workspaceId } })).id;

    await expectDenied(
      connect(owner, { document: otherDocument, token: tokenFor(owner, documentId) }),
      "invalid-token",
    );
  });

  it("rejects a user who is not a member of the document's workspace", async () => {
    const outsider = await createUser("Outsider");
    const alice = connect(owner);
    await synced(alice);
    alice.text.insert(0, "confidential");
    await waitFor(() => alice.provider.unsyncedChanges === 0, "edit acknowledged");

    const intruder = connect(outsider);

    await expectDenied(intruder, "access-denied");
    expect(intruder.text.toString()).toBe("");
  });

  it("rejects a deleted document and a session that no longer exists", async () => {
    await db.session.delete({ where: { id: member.sessionId } }); // member logged out
    await expectDenied(connect(member), "access-denied");

    await db.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await expectDenied(connect(owner), "access-denied");
  });

  it("does not create rooms or content for unknown document ids", async () => {
    const unknown = "00000000-0000-7000-8000-000000000000";

    await expectDenied(connect(owner, { document: unknown }), "access-denied");
    await expectDenied(connect(owner, { document: "not-a-uuid", token: tokenFor(owner) }), "invalid-token");

    expect(collaboration.server.hocuspocus.getDocumentsCount()).toBe(0);
    expect(await db.documentContent.count()).toBe(0);
  });
});

describe("read-only access (viewer role)", () => {
  it("lets a viewer read live content but discards everything it tries to write", async () => {
    const viewer = await createUser("Viewer", "VIEWER");
    const alice = connect(owner);
    await synced(alice);
    alice.text.insert(0, "Written by the owner");

    const reader = connect(viewer);
    await synced(reader);

    // The server, not the client, decided the scope.
    expect(reader.provider.authorizedScope).toBe("readonly");
    expect(alice.provider.authorizedScope).toBe("read-write");
    await waitFor(() => reader.text.toString() === "Written by the owner", "viewer receives content");

    // A modified client that ignores read-only mode and writes anyway:
    reader.text.insert(0, "VIEWER WAS HERE ");
    alice.text.insert(alice.text.length, " (continued)");

    await waitFor(() => alice.text.toString().endsWith("(continued)") && isSaved(alice), "owner's edit saved");
    expect(alice.text.toString()).toBe("Written by the owner (continued)");
    expect(await storedText()).toBe("Written by the owner (continued)");
    // The viewer still receives updates.
    await waitFor(() => reader.text.toString().includes("(continued)"), "viewer keeps receiving");
  });

  it("does not let a viewer's offline edits in when it reconnects", async () => {
    const viewer = await createUser("Viewer", "VIEWER");
    const alice = connect(owner);
    const reader = connect(viewer);
    await Promise.all([synced(alice), synced(reader)]);

    reader.provider.disconnect();
    await waitFor(() => !reader.provider.isSynced, "viewer offline");
    reader.text.insert(0, "smuggled ");
    await reader.provider.connect();
    await waitFor(() => reader.provider.isAuthenticated, "viewer reconnected");
    alice.text.insert(0, "legit");

    await waitFor(() => isSaved(alice), "owner's edit saved");
    expect(alice.text.toString()).toBe("legit");
    expect(await storedText()).toBe("legit");
  });
});

describe("access revocation", () => {
  it("disconnects a user who was removed from the workspace and keeps them out", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);

    await db.workspaceMember.delete({
      where: { workspaceId_userId: { workspaceId, userId: member.id } },
    });
    await collaboration.recheckAccess();

    await waitFor(() => bob.closeCodes.includes(ACCESS_REVOKED_CLOSE_CODE), "bob is disconnected");
    // The automatic reconnect is refused.
    await waitFor(() => bob.denied.includes("access-denied"), "bob's reconnect is rejected", 10_000);

    bob.text.insert(0, "after removal ");
    alice.text.insert(0, "still here");
    await waitFor(() => isSaved(alice), "owner's edit saved");
    expect(alice.text.toString()).toBe("still here");
    expect(alice.provider.isSynced).toBe(true);
  });

  it("disconnects a user whose session ended (logout or expiry)", async () => {
    const bob = connect(member);
    await synced(bob);

    await db.session.update({
      where: { id: member.sessionId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await collaboration.recheckAccess();

    await waitFor(() => bob.closeCodes.includes(ACCESS_REVOKED_CLOSE_CODE), "bob is disconnected");
  });

  it("disconnects everyone when the document is deleted", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);

    await db.document.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
    await collaboration.recheckAccess();

    await waitFor(
      () =>
        alice.closeCodes.includes(ACCESS_REVOKED_CLOSE_CODE) &&
        bob.closeCodes.includes(ACCESS_REVOKED_CLOSE_CODE),
      "both are disconnected",
    );
  });

  it("applies a downgrade to viewer: the client reconnects read-only", async () => {
    const alice = connect(owner);
    const bob = connect(member);
    await Promise.all([synced(alice), synced(bob)]);
    expect(bob.provider.authorizedScope).toBe("read-write");

    await db.workspaceMember.update({
      where: { workspaceId_userId: { workspaceId, userId: member.id } },
      data: { role: "VIEWER" },
    });
    await collaboration.recheckAccess();

    await waitFor(() => bob.provider.authorizedScope === "readonly", "bob is read-only now", 10_000);
    bob.text.insert(0, "not allowed ");
    alice.text.insert(0, "allowed");
    await waitFor(() => isSaved(alice), "owner's edit saved");
    expect(alice.text.toString()).toBe("allowed");
  });

  it("leaves authorised connections alone", async () => {
    const alice = connect(owner);
    await synced(alice);

    await collaboration.recheckAccess();
    alice.text.insert(0, "unaffected");

    await waitFor(() => isSaved(alice), "still connected and saving");
    expect(alice.closeCodes).toEqual([]);
  });
});
