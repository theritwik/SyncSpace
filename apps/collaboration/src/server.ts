import { createServer, type Server, type ServerResponse } from "node:http";

/**
 * HTTP server for the collaboration service.
 *
 * It currently exposes only a liveness endpoint. Real-time document sync is
 * not implemented yet and will attach to this server in a later phase.
 */
export function createCollaborationServer(): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      sendJson(response, 200, {
        status: "ok",
        service: "collaboration",
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.round(process.uptime()),
      });
      return;
    }

    sendJson(response, 404, { error: "Not Found" });
  });
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: Record<string, unknown>,
): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}
