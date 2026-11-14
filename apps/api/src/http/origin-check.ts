import type { FastifyInstance } from "fastify";

import { HttpError } from "./errors.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence for cookie-authenticated requests.
 *
 * Browsers attach cookies automatically, so a malicious site could try to
 * submit a request "as" a signed-in user. Browsers also attach an `Origin`
 * header to such requests that page scripts cannot forge, so every
 * state-changing request whose Origin is not the web app is rejected.
 * This complements the session cookie's SameSite=Lax attribute.
 *
 * Requests without an Origin header come from non-browser clients (curl,
 * server-to-server calls), which have no ambient cookies to abuse.
 */
export function registerOriginCheck(app: FastifyInstance, allowedOrigin: string): void {
  app.addHook("onRequest", async (request) => {
    if (SAFE_METHODS.has(request.method)) return;

    const { origin } = request.headers;
    const crossSite =
      origin !== undefined
        ? origin !== allowedOrigin
        : request.headers["sec-fetch-site"] === "cross-site";

    if (crossSite) {
      throw new HttpError(403, "FORBIDDEN_ORIGIN", "Request origin is not allowed.");
    }
  });
}
