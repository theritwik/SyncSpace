import type { Document, PrismaClient, User, Workspace, WorkspaceRole } from "@syncspace/database";
import {
  canDeleteDocument,
  canEditDocument,
  canEditDocuments,
  canManageSharing,
  createDocumentRequestSchema,
  getFolderPath,
  listDocumentsQuerySchema,
  updateDocumentRequestSchema,
  resolveDocumentRole,
  type DocumentListResponse,
  type DocumentResponse,
  type DocumentRole,
  type DocumentSummary,
} from "@syncspace/shared";
import type { FastifyPluginAsync } from "fastify";

import { validate } from "../../http/errors.js";
import { requireUser } from "../auth/session.js";
import { requireFolderInWorkspace } from "../folders/folder.routes.js";
import {
  assertAllowed,
  requireWorkspaceAccess,
  slugParamsSchema,
} from "../workspaces/workspace.access.js";
import { documentParamsSchema, requireDocumentAccess } from "./document.access.js";

export interface DocumentRoutesOptions {
  db: PrismaClient;
}

type DocumentWithCreator = Document & { createdBy: User | null };

/**
 * Moving changes the workspace's folder structure, so besides an editing role
 * on the document it needs a workspace role that may organise documents.
 * Someone who only has the document shared with them cannot move it.
 */
function canMoveDocument(role: DocumentRole, workspaceRole: WorkspaceRole | null): boolean {
  return canEditDocument(role) && workspaceRole !== null && canEditDocuments(workspaceRole);
}

function toDocumentSummary(document: DocumentWithCreator, role: DocumentRole): DocumentSummary {
  return {
    role,
    id: document.id,
    workspaceId: document.workspaceId,
    folderId: document.folderId,
    title: document.title,
    createdBy: document.createdBy
      ? { id: document.createdBy.id, name: document.createdBy.name }
      : null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

async function toDocumentResponse(
  db: PrismaClient,
  document: DocumentWithCreator,
  workspace: Workspace,
  role: DocumentRole,
  workspaceRole: WorkspaceRole | null,
): Promise<DocumentResponse> {
  const isWorkspaceMember = workspaceRole !== null;
  // The folder structure belongs to the workspace. People the document was
  // shared with from outside do not get to see it.
  const folders =
    document.folderId && isWorkspaceMember
      ? await db.folder.findMany({ where: { workspaceId: workspace.id } })
      : [];

  return {
    document: {
      ...toDocumentSummary(document, role),
      folderId: isWorkspaceMember ? document.folderId : null,
      canEdit: canEditDocument(role),
      canMove: canMoveDocument(role, workspaceRole),
      canDelete: canDeleteDocument(role),
      canShare: canManageSharing(role),
      isWorkspaceMember,
      workspace: { id: workspace.id, name: workspace.name, slug: workspace.slug },
      folderPath: getFolderPath(folders, document.folderId).map(({ id, name }) => ({ id, name })),
    },
  };
}

export const documentRoutes: FastifyPluginAsync<DocumentRoutesOptions> = async (app, { db }) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  /** Documents of a workspace, most recently updated first. Deleted documents are excluded. */
  app.get("/workspaces/:slug/documents", async (request): Promise<DocumentListResponse> => {
    const user = await requireUser(db, request);
    const { slug } = validate(slugParamsSchema, request.params);
    const { workspace, role: workspaceRole } = await requireWorkspaceAccess(db, user.id, slug);
    const { folderId, limit } = validate(listDocumentsQuerySchema, request.query);

    const documents = await db.document.findMany({
      where: {
        workspaceId: workspace.id,
        deletedAt: null,
        ...(folderId === undefined ? {} : { folderId: folderId === "root" ? null : folderId }),
      },
      // The user's own grant, if any: it can raise their role for a document.
      include: { createdBy: true, permissions: { where: { userId: user.id } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit,
    });

    return {
      documents: documents.map((document) =>
        toDocumentSummary(
          document,
          // Never null here: the user is a member of the workspace.
          resolveDocumentRole({ workspaceRole, grantedRole: document.permissions[0]?.role }) ??
            "VIEWER",
        ),
      ),
    };
  });

  app.post("/workspaces/:slug/documents", async (request, reply): Promise<DocumentResponse> => {
    const user = await requireUser(db, request);
    const { slug } = validate(slugParamsSchema, request.params);
    const { workspace, role } = await requireWorkspaceAccess(db, user.id, slug);
    assertAllowed(canEditDocuments(role));
    const { title, folderId } = validate(createDocumentRequestSchema, request.body ?? {});

    if (folderId) await requireFolderInWorkspace(db, workspace.id, folderId, "folderId");

    // The creator becomes the document's owner. Both rows are written in one
    // transaction, so a document never exists without that grant.
    const document = await db.document.create({
      data: {
        title,
        folderId,
        workspaceId: workspace.id,
        createdById: user.id,
        permissions: { create: { userId: user.id, role: "OWNER", grantedById: user.id } },
      },
      include: { createdBy: true },
    });

    reply.code(201);
    return toDocumentResponse(db, document, workspace, "OWNER", role);
  });

  app.get("/documents/:id", async (request): Promise<DocumentResponse> => {
    const user = await requireUser(db, request);
    const { id } = validate(documentParamsSchema, request.params);
    const { document, role, workspaceRole } = await requireDocumentAccess(db, user.id, id);

    return toDocumentResponse(db, document, document.workspace, role, workspaceRole);
  });

  /** Rename and/or move a document. */
  app.patch("/documents/:id", async (request): Promise<DocumentResponse> => {
    const user = await requireUser(db, request);
    const { id } = validate(documentParamsSchema, request.params);
    const {
      document: existing,
      role,
      workspaceRole,
    } = await requireDocumentAccess(db, user.id, id);
    assertAllowed(canEditDocument(role));
    const { title, folderId } = validate(updateDocumentRequestSchema, request.body);

    if (folderId !== undefined) {
      assertAllowed(canMoveDocument(role, workspaceRole));
    }

    // The target folder must belong to the document's own workspace.
    if (folderId) await requireFolderInWorkspace(db, existing.workspaceId, folderId, "folderId");

    const document = await db.document.update({
      where: { id: existing.id },
      // `undefined` leaves a column unchanged; `folderId: null` moves to the top level.
      data: { title, folderId },
      include: { createdBy: true },
    });

    return toDocumentResponse(db, document, existing.workspace, role, workspaceRole);
  });

  /** Soft delete: the row stays, but the document disappears from every endpoint. */
  app.delete("/documents/:id", async (request, reply) => {
    const user = await requireUser(db, request);
    const { id } = validate(documentParamsSchema, request.params);
    const { document, role } = await requireDocumentAccess(db, user.id, id);
    assertAllowed(canDeleteDocument(role));

    await db.document.update({ where: { id: document.id }, data: { deletedAt: new Date() } });

    return reply.code(204).send();
  });
};
