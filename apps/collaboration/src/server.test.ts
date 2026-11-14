import type { AddressInfo } from "node:net";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCollaborationServer } from "./server.js";

describe("collaboration service", () => {
  const server = createCollaborationServer();
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("GET /health reports the service as running", async () => {
    const response = await fetch(`${baseUrl}/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", service: "collaboration" });
  });

  it("responds with 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/documents`);

    expect(response.status).toBe(404);
  });
});
