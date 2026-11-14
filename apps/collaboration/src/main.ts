import { createDatabaseClient } from "@syncspace/database";

import { createCollaborationServer } from "./collaboration-server.js";
import { loadEnv } from "./config/env.js";

const env = loadEnv();
const database = createDatabaseClient(env.DATABASE_URL);
const { server, recheckAccess } = createCollaborationServer({
  db: database,
  tokenSecret: env.COLLABORATION_TOKEN_SECRET,
  host: env.COLLABORATION_HOST,
});

const recheckTimer = setInterval(() => {
  recheckAccess().catch((error: unknown) => {
    console.error("Access re-check failed:", error);
  });
}, env.COLLABORATION_ACCESS_RECHECK_SECONDS * 1000);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`Received ${signal}, saving documents and shutting down`);
    clearInterval(recheckTimer);
    // destroy() closes all connections and writes every unsaved document
    // before it resolves, so a restart does not lose recent edits.
    server
      .destroy()
      .then(() => database.$disconnect())
      .then(
        () => process.exit(0),
        (error: unknown) => {
          console.error("Error during shutdown:", error);
          process.exit(1);
        },
      );
  });
}

try {
  await server.listen(env.COLLABORATION_PORT);
  console.log(
    `Collaboration service listening on ws://${env.COLLABORATION_HOST}:${env.COLLABORATION_PORT}`,
  );
} catch (error) {
  console.error("Failed to start collaboration service:", error);
  process.exit(1);
}
