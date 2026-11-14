import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { checkDatabaseConnection, type PrismaClient } from "@syncspace/database";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";

import { registerErrorHandlers, tooManyAttempts } from "./http/errors.js";
import { registerOriginCheck } from "./http/origin-check.js";
import { authRoutes, type AuthRateLimits } from "./modules/auth/auth.routes.js";
import { documentRoutes } from "./modules/documents/document.routes.js";
import { folderRoutes } from "./modules/folders/folder.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { workspaceRoutes } from "./modules/workspaces/workspace.routes.js";

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export interface AppConfig {
  /** Origin of the web app; other browser origins may not send state-changing requests. */
  webOrigin: string;
  secureCookies: boolean;
  sessionTtlDays: number;
  /** Read the client IP from X-Forwarded-For. Only safe behind a trusted proxy. */
  trustProxy: boolean;
  /** Overrides for the default limits (used by tests). */
  rateLimits?: Partial<AuthRateLimits>;
}

const DEFAULT_RATE_LIMITS: AuthRateLimits = {
  loginPerIp: { max: 20, windowMs: 15 * MINUTE_MS },
  loginFailuresPerAccount: { max: 10, windowMs: 15 * MINUTE_MS },
  registerPerIp: { max: 10, windowMs: 60 * MINUTE_MS },
};

export interface AppOptions {
  database: PrismaClient;
  config: AppConfig;
  /** Overrides the database probe used by the health check (for tests). */
  checkDatabase?: () => Promise<void>;
  logger?: FastifyServerOptions["logger"];
}

export function buildApp({
  database,
  config,
  checkDatabase = () => checkDatabaseConnection(database),
  logger = false,
}: AppOptions): FastifyInstance {
  const app = Fastify({ logger, trustProxy: config.trustProxy });

  registerErrorHandlers(app);
  registerOriginCheck(app, config.webOrigin);

  app.register(cookie);
  // Rate limiting is opt-in per route (`config.rateLimit`). Counters live in
  // this process's memory, which is correct for a single API instance.
  app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () => tooManyAttempts(),
  });

  app.register(healthRoutes, { prefix: "/api/v1", checkDatabase });
  app.register(authRoutes, {
    prefix: "/api/v1/auth",
    db: database,
    sessionTtlMs: config.sessionTtlDays * DAY_MS,
    secureCookies: config.secureCookies,
    rateLimits: { ...DEFAULT_RATE_LIMITS, ...config.rateLimits },
  });
  app.register(workspaceRoutes, { prefix: "/api/v1/workspaces", db: database });
  app.register(folderRoutes, { prefix: "/api/v1", db: database });
  app.register(documentRoutes, { prefix: "/api/v1", db: database });

  return app;
}
