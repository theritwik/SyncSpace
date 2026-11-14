import { apiErrorResponseSchema, apiHealthResponseSchema } from "@syncspace/shared";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { createTestApp } from "../../test/test-app.js";

describe("GET /api/v1/health", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("returns 200 and status ok when the database is reachable", async () => {
    ({ app } = createTestApp());

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = apiHealthResponseSchema.parse(response.json());
    expect(body).toMatchObject({ status: "ok", service: "api", checks: { database: "up" } });
  });

  it("returns 503 and status degraded when the database is unreachable", async () => {
    // The probe is replaced to simulate an outage without stopping PostgreSQL.
    ({ app } = createTestApp({
      checkDatabase: async () => {
        throw new Error("connection refused");
      },
    }));

    const response = await app.inject({ method: "GET", url: "/api/v1/health" });

    expect(response.statusCode).toBe(503);
    const body = apiHealthResponseSchema.parse(response.json());
    expect(body).toMatchObject({ status: "degraded", checks: { database: "down" } });
  });

  it("returns the standard error shape for unknown routes", async () => {
    ({ app } = createTestApp());

    const response = await app.inject({ method: "GET", url: "/api/v1/unknown" });

    expect(response.statusCode).toBe(404);
    expect(apiErrorResponseSchema.parse(response.json()).error.code).toBe("NOT_FOUND");
  });
});
