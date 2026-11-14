import { describe, expect, it } from "vitest";
import { z } from "zod";

import { EnvValidationError, parseEnv } from "./env.js";

const schema = z.object({
  PORT: z.coerce.number().int().positive(),
  DATABASE_URL: z.url(),
});

describe("parseEnv", () => {
  it("returns typed, coerced values for a valid environment", () => {
    const env = parseEnv(schema, { PORT: "4000", DATABASE_URL: "postgresql://localhost/db" });

    expect(env).toEqual({ PORT: 4000, DATABASE_URL: "postgresql://localhost/db" });
  });

  it("reports every invalid variable by name", () => {
    expect(() => parseEnv(schema, { PORT: "abc" })).toThrowError(EnvValidationError);
    expect(() => parseEnv(schema, { PORT: "abc" })).toThrowError(/PORT[\s\S]*DATABASE_URL/);
  });
});
