import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies defaults when only required variables are set", () => {
    const env = loadEnv({ DATABASE_URL: "postgresql://user:pass@localhost:5432/syncspace" });

    expect(env).toMatchObject({
      NODE_ENV: "development",
      API_HOST: "0.0.0.0",
      API_PORT: 4000,
      LOG_LEVEL: "info",
    });
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => loadEnv({})).toThrowError(/DATABASE_URL/);
  });

  it("rejects a non-PostgreSQL DATABASE_URL and an out-of-range port", () => {
    expect(() => loadEnv({ DATABASE_URL: "mysql://localhost/db" })).toThrowError(/DATABASE_URL/);
    expect(() =>
      loadEnv({ DATABASE_URL: "postgresql://localhost/db", API_PORT: "70000" }),
    ).toThrowError(/API_PORT/);
  });
});
