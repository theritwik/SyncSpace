import { checkDatabaseConnection, createDatabaseClient } from "@syncspace/database";

import { buildApp } from "./app.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const database = createDatabaseClient(env.DATABASE_URL);

const app = buildApp({
  checkDatabase: () => checkDatabaseConnection(database),
  logger: { level: env.LOG_LEVEL },
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
