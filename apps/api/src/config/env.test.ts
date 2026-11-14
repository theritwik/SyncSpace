import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.js";

const required = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/syncspace",
  WEB_ORIGIN: "http://localhost:3000",
  COLLABORATION_TOKEN_SECRET: "test-secret-test-secret-test-secret-1234",
};

describe("loadEnv", () => {
  it("applies defaults when only required variables are set", () => {
    expect(loadEnv(required)).toMatchObject({
      NODE_ENV: "development",
      API_HOST: "0.0.0.0",
      API_PORT: 4000,
      LOG_LEVEL: "info",
      SESSION_TTL_DAYS: 7,
      TRUST_PROXY: false,
    });
  });

  it("normalises WEB_ORIGIN to a bare origin", () => {
    expect(loadEnv({ ...required, WEB_ORIGIN: "https://app.example.com/some/path" }).WEB_ORIGIN).toBe(
      "https://app.example.com",
    );
  });

  it("rejects missing required variables", () => {
    expect(() => loadEnv({})).toThrowError(/DATABASE_URL[\s\S]*WEB_ORIGIN/);
  });

  it("rejects a collaboration token secret that is too short", () => {
    expect(() => loadEnv({ ...required, COLLABORATION_TOKEN_SECRET: "short" })).toThrowError(
      /COLLABORATION_TOKEN_SECRET/,
    );
  });

  it("rejects a non-PostgreSQL DATABASE_URL and an out-of-range port", () => {
    expect(() => loadEnv({ ...required, DATABASE_URL: "mysql://localhost/db" })).toThrowError(
      /DATABASE_URL/,
    );
    expect(() => loadEnv({ ...required, API_PORT: "70000" })).toThrowError(/API_PORT/);
  });
});
