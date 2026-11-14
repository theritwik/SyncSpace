import type { ApiHealthResponse } from "@syncspace/shared";
import type { FastifyPluginAsync } from "fastify";

const DATABASE_CHECK_TIMEOUT_MS = 2_000;

interface HealthRoutesOptions {
  checkDatabase: () => Promise<void>;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (
  app,
  { checkDatabase },
) => {
  app.get("/health", async (request, reply): Promise<ApiHealthResponse> => {
    let databaseUp = true;
    try {
      await withTimeout(checkDatabase(), DATABASE_CHECK_TIMEOUT_MS);
    } catch (error) {
      databaseUp = false;
      request.log.warn({ err: error }, "Database health check failed");
    }

    reply.code(databaseUp ? 200 : 503).header("cache-control", "no-store");

    return {
      status: databaseUp ? "ok" : "degraded",
      service: "api",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      checks: {
        database: databaseUp ? "up" : "down",
      },
    };
  });
};

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
