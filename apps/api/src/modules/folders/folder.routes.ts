import type { Folder, PrismaClient } from "@syncspace/database";
import {
  canEditDocuments,
  createFolderRequestSchema,
  getFolderPath,
  MAX_FOLDER_DEPTH,
  type FolderListResponse,
  type FolderResponse,
  type FolderSummary,
} from "@syncspace/shared";
import type { FastifyPluginAsync } from "fastify";

import { HttpError, validate } from "../../http/errors.js";
import { requireUser } from "../auth/session.js";
import {
  assertAllowed,
  requireWorkspaceAccess,
  slugParamsSchema,
} from "../workspaces/workspace.access.js";

export interface FolderRoutesOptions {
  db: PrismaClient;
}

function toFolderSummary(folder: Folder): FolderSummary {
  return {
    id: folder.id,
    workspaceId: folder.workspaceId,
    parentId: folder.parentId,
    name: folder.name,
    createdAt: folder.createdAt.toISOString(),
  };
}

/**
 * Checks that `folderId` names a folder of this workspace and returns all of
 * the workspace's folders (callers need them to compute paths and depths).
 * Used for every folder reference that arrives in a request body.
 */
export async function requireFolderInWorkspace(
  db: PrismaClient,
  workspaceId: string,
  folderId: string,
  field: string,
): Promise<Folder[]> {
  const folders = await db.folder.findMany({ where: { workspaceId } });
  if (!folders.some((folder) => folder.id === folderId)) {
    // Also the answer for a folder of another workspace: its existence is not revealed.
    throw new HttpError(400, "VALIDATION_ERROR", "Some fields are invalid.", [
      { path: field, message: "This folder does not exist in the workspace." },
    ]);
  }
  return folders;
}

export const folderRoutes: FastifyPluginAsync<FolderRoutesOptions> = async (app, { db }) => {
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  /** All folders of the workspace as a flat list; `parentId` describes the tree. */
  app.get("/workspaces/:slug/folders", async (request): Promise<FolderListResponse> => {
    const user = await requireUser(db, request);
    const { slug } = validate(slugParamsSchema, request.params);
    const { workspace } = await requireWorkspaceAccess(db, user.id, slug);

    const folders = await db.folder.findMany({
      where: { workspaceId: workspace.id },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });

    return { folders: folders.map(toFolderSummary) };
  });

  app.post("/workspaces/:slug/folders", async (request, reply): Promise<FolderResponse> => {
    const user = await requireUser(db, request);
    const { slug } = validate(slugParamsSchema, request.params);
    const { workspace, role } = await requireWorkspaceAccess(db, user.id, slug);
    assertAllowed(canEditDocuments(role));
    const { name, parentId } = validate(createFolderRequestSchema, request.body);

    if (parentId) {
      const folders = await requireFolderInWorkspace(db, workspace.id, parentId, "parentId");
      const parentDepth = getFolderPath(folders, parentId).length;
      if (parentDepth >= MAX_FOLDER_DEPTH) {
        throw new HttpError(400, "VALIDATION_ERROR", "Some fields are invalid.", [
          {
            path: "parentId",
            message: `Folders can be nested at most ${MAX_FOLDER_DEPTH} levels deep.`,
          },
        ]);
      }
    }

    // A folder's parent is fixed at creation and folders cannot be moved, so
    // the tree can never contain a cycle. The composite foreign key in the
    // database additionally rejects a parent from another workspace.
    const folder = await db.folder.create({
      data: { name, parentId, workspaceId: workspace.id, createdById: user.id },
    });

    reply.code(201);
    return { folder: toFolderSummary(folder) };
  });
};
