import { loadEnv } from "./config/env.js";
import { createCollaborationServer } from "./server.js";

const env = loadEnv();
const server = createCollaborationServer();

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    console.log(`Received ${signal}, shutting down`);
    server.close((error) => process.exit(error ? 1 : 0));
  });
}

server.once("error", (error) => {
  console.error("Failed to start collaboration service:", error.message);
  process.exit(1);
});

server.listen(env.COLLABORATION_PORT, env.COLLABORATION_HOST, () => {
  console.log(
    `Collaboration service listening on http://${env.COLLABORATION_HOST}:${env.COLLABORATION_PORT}`,
  );
});
