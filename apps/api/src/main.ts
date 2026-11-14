import { createDatabaseClient } from "@syncspace/database";

import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const database = createDatabaseClient(env.DATABASE_URL);

const app = buildApp({
  database,
  config: {
    webOrigin: env.WEB_ORIGIN,
    secureCookies: env.NODE_ENV === "production",
    sessionTtlDays: env.SESSION_TTL_DAYS,
    trustProxy: env.TRUST_PROXY,
    collaborationTokenSecret: env.COLLABORATION_TOKEN_SECRET,
  },
  logger: {
    level: env.LOG_LEVEL,
    // Fastify's default request log contains no headers or bodies. Redaction
    // is a second line of defence in case a log call ever includes them.
    redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
  },
});

app.addHook("onClose", async () => {
  await database.$disconnect();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "Shutting down");
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, "Error during shutdown");
        process.exit(1);
      },
    );
  });
}

try {
  await app.listen({ host: env.API_HOST, port: env.API_PORT });
} catch (error) {
  app.log.fatal({ err: error }, "Failed to start API");
  process.exit(1);
}
