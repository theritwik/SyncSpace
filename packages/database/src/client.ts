import { PrismaPg } from "@prisma/adapter-pg";

import { Prisma, PrismaClient } from "./generated/prisma/client.js";

/** Creates a Prisma client backed by the node-postgres driver adapter. */
export function createDatabaseClient(connectionString: string): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

/** Resolves when the database answers a trivial query; rejects otherwise. */
export async function checkDatabaseConnection(client: PrismaClient): Promise<void> {
  await client.$queryRaw`SELECT 1`;
}

/** True when a write failed because it would duplicate a value in a unique column. */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}
