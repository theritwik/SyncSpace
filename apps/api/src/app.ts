import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { healthRoutes } from "./features/health/health.routes.js";

export interface AppOptions {
  /** Resolves when the database is reachable; rejects otherwise. */
  checkDatabase: () => Promise<void>;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp({ checkDatabase, logger = false }: AppOptions): FastifyInstance {
  const app = Fastify({ logger });

  app.register(healthRoutes, { prefix: "/api/v1", checkDatabase });

  return app;
}
