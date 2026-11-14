import { describe, expect, it } from "vitest";

import {
  signCollaborationToken,
  verifyCollaborationToken,
  type CollaborationTokenPayload,
} from "./collaboration-token.js";

const secret = "test-secret-test-secret-test-secret-1234";
const now = new Date("2026-01-01T00:00:00Z");
const payload: CollaborationTokenPayload = {
  userId: "019a0000-0000-7000-8000-000000000001",
  sessionId: "019a0000-0000-7000-8000-000000000002",
  documentId: "019a0000-0000-7000-8000-000000000003",
  exp: Math.floor(now.getTime() / 1000) + 60,
};

describe("collaboration tokens", () => {
  it("round-trips a valid token", () => {
    const token = signCollaborationToken(payload, secret);

    expect(verifyCollaborationToken(token, secret, now)).toEqual(payload);
  });

  it("rejects a token signed with another secret", () => {
    const token = signCollaborationToken(payload, "another-secret-another-secret-another-1");

    expect(verifyCollaborationToken(token, secret, now)).toBeNull();
  });

  it("rejects a token whose payload was changed after signing", () => {
    const [, signature] = signCollaborationToken(payload, secret).split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ ...payload, documentId: "019a0000-0000-7000-8000-00000000ffff" }),
    ).toString("base64url");

    expect(verifyCollaborationToken(`${forgedPayload}.${signature}`, secret, now)).toBeNull();
  });

  it("rejects an expired token", () => {
    const token = signCollaborationToken(payload, secret);
    const later = new Date(now.getTime() + 61_000);

    expect(verifyCollaborationToken(token, secret, later)).toBeNull();
  });

  it("rejects malformed input without throwing", () => {
    for (const token of ["", "abc", "a.b.c", "!!!.???", `${"x".repeat(10)}.${"y".repeat(43)}`]) {
      expect(verifyCollaborationToken(token, secret, now)).toBeNull();
    }
  });
});
