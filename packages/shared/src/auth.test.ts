import { describe, expect, it } from "vitest";

import { loginRequestSchema, registerRequestSchema } from "./auth.js";

describe("registerRequestSchema", () => {
  it("normalises name and email", () => {
    const result = registerRequestSchema.parse({
      name: "  Ada Lovelace ",
      email: "  Ada@Example.COM ",
      password: "correct horse battery",
    });

    expect(result).toEqual({
      name: "Ada Lovelace",
      email: "ada@example.com",
      password: "correct horse battery",
    });
  });

  it("rejects short passwords, invalid emails and blank names", () => {
    const result = registerRequestSchema.safeParse({ name: " ", email: "nope", password: "short" });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual([
      "name",
      "email",
      "password",
    ]);
  });
});

describe("loginRequestSchema", () => {
  it("does not apply the registration password policy", () => {
    expect(loginRequestSchema.safeParse({ email: "ada@example.com", password: "x" }).success).toBe(
      true,
    );
  });

  it("rejects missing fields with readable messages", () => {
    const result = loginRequestSchema.safeParse({});

    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Enter your email address.",
      "Enter your password.",
    ]);
  });
});
