import { apiHealthResponseSchema } from "@syncspace/shared";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../../app.js";

// Route-level tests: the database probe is injected so both outcomes can be
// exercised without a running PostgreSQL. The real probe is covered by the
// integration tests in @syncspace/database.
describe("GET /api/v1/health", () => {
  let app: ReturnType<typeof buildApp>;

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 and status ok when the database is reachable", async () => {
    app = buildApp({ checkDatabase: async () => {} });

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = apiHealthResponseSchema.parse(response.json());
    expect(body).toMatchObject({ status: "ok", service: "api", checks: { database: "up" } });
  });

  it("returns 503 and status degraded when the database is unreachable", async () => {
    app = buildApp({
      checkDatabase: async () => {
        throw new Error("connection refused");
      },
    });

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(503);
    const body = apiHealthResponseSchema.parse(response.json());
    expect(body).toMatchObject({ status: "degraded", checks: { database: "down" } });
  });

  it("returns 404 for unknown routes", async () => {
    app = buildApp({ checkDatabase: async () => {} });

    const response = await app.inject({ method: "GET", url: "/api/v1/unknown" });

    expect(response.statusCode).toBe(404);
  });
});
