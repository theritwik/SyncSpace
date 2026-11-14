import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client.js";

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
