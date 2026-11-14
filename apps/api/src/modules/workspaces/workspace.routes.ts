import { isUniqueConstraintError, type PrismaClient } from "@syncspace/database";
import {
  canDeleteWorkspace,
  canManageWorkspace,
  createWorkspaceRequestSchema,
  updateWorkspaceRequestSchema,
  type WorkspaceListResponse,
  type WorkspaceMembersResponse,
  type WorkspaceResponse,
  type WorkspaceSummary,
} from "@syncspace/shared";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { validate } from "../../http/errors.js";
import { requireUser } from "../auth/session.js";
import { generateWorkspaceSlug } from "./slug.js";
import { assertAllowed, requireWorkspaceAccess, type WorkspaceAccess } from "./workspace.access.js";

export interface WorkspaceRoutesOptions {
  db: PrismaClient;
}

const slugParamsSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]{1,64}$/, "Invalid workspace identifier."),
});

const SLUG_ATTEMPTS = 3;

function toWorkspaceSummary({ workspace, role }: WorkspaceAccess): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    role,
    memberCount: workspace._count.members,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
  };
}

export const workspaceRoutes: FastifyPluginAsync<WorkspaceRoutesOptions> = async (app, { db }) => {
  // Every response depends on who is asking and must never be cached.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  /** Workspaces the signed-in user is a member of. */
  app.get("/", async (request): Promise<WorkspaceListResponse> => {
    const user = await requireUser(db, request);

    const memberships = await db.workspaceMember.findMany({
      where: { userId: user.id },
      include: { workspace: { include: { _count: { select: { members: true } } } } },
      orderBy: { workspace: { createdAt: "asc" } },
    });

    return { workspaces: memberships.map(toWorkspaceSummary) };
  });

  app.post("/", async (request, reply): Promise<WorkspaceResponse> => {
    const user = await requireUser(db, request);
    const { name } = validate(createWorkspaceRequestSchema, request.body);

    for (let attempt = 1; ; attempt++) {
      try {
        // A transaction makes the two inserts all-or-nothing: a workspace can
        // never exist without its owner. If the second insert fails, the
        // first is rolled back.
        const workspace = await db.$transaction(async (tx) => {
          const created = await tx.workspace.create({
            data: { name, slug: generateWorkspaceSlug(name) },
          });
          await tx.workspaceMember.create({
            data: { workspaceId: created.id, userId: user.id, role: "OWNER" },
          });
          return created;
        });

        reply.code(201);
        return {
          workspace: toWorkspaceSummary({
            workspace: { ...workspace, _count: { members: 1 } },
            role: "OWNER",
          }),
        };
      } catch (error) {
        // The random slug suffix collided with an existing one: try another.
        if (isUniqueConstraintError(error) && attempt < SLUG_ATTEMPTS) continue;
        throw error;
      }
    }
  });

  app.get("/:slug", async (request): Promise<WorkspaceResponse> => {
    const user = await requireUser(db, request);
    const { slug } = validate(slugParamsSchema, request.params);

    return { workspace: toWorkspaceSummary(await requireWorkspaceAccess(db, user.id, slug)) };
  });

  app.patch("/:slug", async (request): Promise<WorkspaceResponse> => {
    const user = await requireUser(db, request);
    const { slug } = validate(slugParamsSchema, request.params);
    const access = await requireWorkspaceAccess(db, user.id, slug);
    assertAllowed(canManageWorkspace(access.role));
    const { name } = validate(updateWorkspaceRequestSchema, request.body);

    const workspace = await db.workspace.update({
      where: { id: access.workspace.id },
      data: { name },
      include: { _count: { select: { members: true } } },
    });

    return { workspace: toWorkspaceSummary({ workspace, role: access.role }) };
  });

  app.delete("/:slug", async (request, reply) => {
    const user = await requireUser(db, request);
    const { slug } = validate(slugParamsSchema, request.params);
    const access = await requireWorkspaceAccess(db, user.id, slug);
    assertAllowed(canDeleteWorkspace(access.role));

    // Memberships are removed with the workspace (ON DELETE CASCADE).
    await db.workspace.delete({ where: { id: access.workspace.id } });

    return reply.code(204).send();
  });

  app.get("/:slug/members", async (request): Promise<WorkspaceMembersResponse> => {
    const user = await requireUser(db, request);
    const { slug } = validate(slugParamsSchema, request.params);
    const { workspace } = await requireWorkspaceAccess(db, user.id, slug);

    const members = await db.workspaceMember.findMany({
      where: { workspaceId: workspace.id },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return {
      members: members.map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
        joinedAt: member.createdAt.toISOString(),
      })),
    };
  });
};
