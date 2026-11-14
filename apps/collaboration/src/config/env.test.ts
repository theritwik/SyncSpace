import { describe, expect, it } from "vitest";

import { loadEnv } from "./env.js";

const required = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/syncspace",
  COLLABORATION_TOKEN_SECRET: "test-secret-test-secret-test-secret-1234",
};

describe("loadEnv", () => {
  it("applies defaults when only required variables are set", () => {
    expect(loadEnv(required)).toMatchObject({
      COLLABORATION_HOST: "0.0.0.0",
      COLLABORATION_PORT: 4001,
      COLLABORATION_ACCESS_RECHECK_SECONDS: 30,
    });
  });

  it("rejects missing or weak configuration", () => {
    expect(() => loadEnv({})).toThrowError(/DATABASE_URL[\s\S]*COLLABORATION_TOKEN_SECRET/);
    expect(() => loadEnv({ ...required, COLLABORATION_TOKEN_SECRET: "short" })).toThrowError(
      /COLLABORATION_TOKEN_SECRET/,
    );
  });
});
