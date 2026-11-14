import type { PrismaClient } from "@syncspace/database";
import {
  apiErrorResponseSchema,
  authResponseSchema,
  SESSION_COOKIE_NAME,
} from "@syncspace/shared";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestApp, resetDatabase, TEST_WEB_ORIGIN } from "../../test/test-app.js";

// Integration tests: real Fastify app, real PostgreSQL (the `_test` database),
// real Argon2 hashing. Requests are sent in-process with `app.inject`.

const ada = { name: "Ada Lovelace", email: "ada@example.com", password: "correct horse battery" };

let app: FastifyInstance;
let database: PrismaClient;

beforeEach(async () => {
  ({ app, database } = createTestApp());
  await resetDatabase(database);
});

afterEach(async () => {
  await app.close();
});

function post(url: string, payload?: object, cookies?: Record<string, string>) {
  return app.inject({
    method: "POST",
    url: `/api/v1/auth${url}`,
    // Browsers send the Origin header on every POST; tests do the same.
    headers: { origin: TEST_WEB_ORIGIN },
    payload,
    cookies,
  });
}

function getMe(cookies?: Record<string, string>) {
  return app.inject({ method: "GET", url: "/api/v1/auth/me", cookies });
}

function sessionCookie(response: LightMyRequestResponse) {
  const cookie = response.cookies.find((candidate) => candidate.name === SESSION_COOKIE_NAME);
  if (!cookie) throw new Error("Response did not set a session cookie");
  return cookie;
}

function errorOf(response: LightMyRequestResponse) {
  return apiErrorResponseSchema.parse(response.json()).error;
}

async function registerAda(): Promise<Record<string, string>> {
  const response = await post("/register", ada);
  expect(response.statusCode).toBe(201);
  return { [SESSION_COOKIE_NAME]: sessionCookie(response).value };
}

describe("POST /api/v1/auth/register", () => {
  it("creates the user, starts a session and returns the public profile", async () => {
    const response = await post("/register", { ...ada, email: "  Ada@Example.com " });

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    const { user } = authResponseSchema.parse(response.json());
    expect(user).toMatchObject({ name: "Ada Lovelace", email: "ada@example.com" });
    expect(response.body).not.toContain("password");

    expect(sessionCookie(response)).toMatchObject({
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    expect(sessionCookie(response).secure).toBeUndefined();
  });

  it("stores an Argon2id hash, never the password, and only a hash of the session token", async () => {
    const response = await post("/register", ada);

    const user = await database.user.findUniqueOrThrow({
      where: { email: ada.email },
      include: { sessions: true },
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(ada.password);

    const token = sessionCookie(response).value;
    expect(user.sessions).toHaveLength(1);
    expect(user.sessions[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(user.sessions[0]?.tokenHash).not.toBe(token);
  });

  it("marks the cookie Secure when secure cookies are enabled (production)", async () => {
    await app.close();
    ({ app, database } = createTestApp({ config: { secureCookies: true } }));

    const response = await post("/register", ada);

    expect(sessionCookie(response).secure).toBe(true);
  });

  it("rejects a duplicate email, ignoring case, with 409", async () => {
    await registerAda();

    const response = await post("/register", { ...ada, email: "ADA@example.com" });

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).code).toBe("EMAIL_TAKEN");
    expect(response.cookies).toHaveLength(0);
    expect(await database.user.count()).toBe(1);
  });

  it("rejects invalid input with per-field details", async () => {
    const response = await post("/register", { name: "", email: "not-an-email", password: "short" });

    expect(response.statusCode).toBe(400);
    const error = errorOf(response);
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.details?.map((detail) => detail.path)).toEqual(["name", "email", "password"]);
    expect(await database.user.count()).toBe(0);
  });

  it("rejects malformed JSON with the standard error shape", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/register",
      headers: { origin: TEST_WEB_ORIGIN, "content-type": "application/json" },
      payload: "{not json",
    });

    expect(response.statusCode).toBe(400);
    expect(errorOf(response).code).toBe("BAD_REQUEST");
  });
});

describe("POST /api/v1/auth/login", () => {
  it("signs in with valid credentials and issues a new session", async () => {
    const registrationCookies = await registerAda();

    const response = await post("/login", { email: "ADA@example.com", password: ada.password });

    expect(response.statusCode).toBe(200);
    expect(authResponseSchema.parse(response.json()).user.email).toBe(ada.email);
    expect(sessionCookie(response).httpOnly).toBe(true);
    expect(sessionCookie(response).value).not.toBe(registrationCookies[SESSION_COOKIE_NAME]);
  });

  it("rejects a wrong password with 401 and sets no cookie", async () => {
    await registerAda();

    const response = await post("/login", { email: ada.email, password: "wrong password!" });

    expect(response.statusCode).toBe(401);
    expect(errorOf(response)).toEqual({
      code: "INVALID_CREDENTIALS",
      message: "Invalid email or password.",
    });
    expect(response.cookies).toHaveLength(0);
  });

  it("answers an unknown email exactly like a wrong password", async () => {
    await registerAda();

    const wrongPassword = await post("/login", { email: ada.email, password: "wrong password!" });
    const unknownEmail = await post("/login", { email: "nobody@example.com", password: ada.password });

    expect(unknownEmail.statusCode).toBe(401);
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
  });

  it("replaces the session presented at login instead of keeping both", async () => {
    const oldCookies = await registerAda();

    const response = await post("/login", { email: ada.email, password: ada.password }, oldCookies);

    expect(response.statusCode).toBe(200);
    expect(await database.session.count()).toBe(1);
    expect((await getMe(oldCookies)).statusCode).toBe(401);
  });

  it("rejects missing fields with 400", async () => {
    const response = await post("/login", {});

    expect(response.statusCode).toBe(400);
    expect(errorOf(response).code).toBe("VALIDATION_ERROR");
  });

  it("rate limits repeated attempts from one client IP", async () => {
    await app.close();
    ({ app, database } = createTestApp({
      config: { rateLimits: { loginPerIp: { max: 3, windowMs: 60_000 } } },
    }));
    // Different emails each time: only the per-IP limit can trigger.
    const attempt = (i: number) =>
      post("/login", { email: `user${i}@example.com`, password: "wrong password!" });

    for (let i = 0; i < 3; i++) {
      expect((await attempt(i)).statusCode).toBe(401);
    }
    const blocked = await attempt(3);

    expect(blocked.statusCode).toBe(429);
    expect(errorOf(blocked).code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();
  });

  it("locks an account's login after repeated failures, even with the right password", async () => {
    await app.close();
    ({ app, database } = createTestApp({
      config: { rateLimits: { loginFailuresPerAccount: { max: 3, windowMs: 60_000 } } },
    }));
    await registerAda();

    for (let i = 0; i < 3; i++) {
      const failed = await post("/login", { email: ada.email, password: "wrong password!" });
      expect(failed.statusCode).toBe(401);
    }
    const blocked = await post("/login", { email: "ADA@example.com", password: ada.password });

    expect(blocked.statusCode).toBe(429);
    expect(errorOf(blocked).code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBeDefined();
    expect(blocked.cookies).toHaveLength(0);
  });

  it("does not count successful logins towards the account limit", async () => {
    await app.close();
    ({ app, database } = createTestApp({
      config: { rateLimits: { loginFailuresPerAccount: { max: 2, windowMs: 60_000 } } },
    }));
    await registerAda();

    for (let i = 0; i < 4; i++) {
      const response = await post("/login", { email: ada.email, password: ada.password });
      expect(response.statusCode).toBe(200);
    }
  });
});

describe("GET /api/v1/auth/me", () => {
  it("returns the profile of the signed-in user", async () => {
    const cookies = await registerAda();

    const response = await getMe(cookies);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(authResponseSchema.parse(response.json()).user).toMatchObject({
      name: ada.name,
      email: ada.email,
    });
  });

  it("rejects a request without a session cookie", async () => {
    const response = await getMe();

    expect(response.statusCode).toBe(401);
    expect(errorOf(response).code).toBe("UNAUTHENTICATED");
  });

  it("rejects an unknown session token", async () => {
    const response = await getMe({ [SESSION_COOKIE_NAME]: "not-a-real-token" });

    expect(response.statusCode).toBe(401);
  });

  it("rejects an expired session and removes it", async () => {
    const cookies = await registerAda();
    await database.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await getMe(cookies);

    expect(response.statusCode).toBe(401);
    expect(await database.session.count()).toBe(0);
  });
});

describe("POST /api/v1/auth/logout", () => {
  it("deletes the session, clears the cookie and invalidates the token", async () => {
    const cookies = await registerAda();
    expect((await getMe(cookies)).statusCode).toBe(200);

    const response = await post("/logout", undefined, cookies);

    expect(response.statusCode).toBe(204);
    expect(sessionCookie(response).value).toBe("");
    expect(sessionCookie(response).expires?.getTime()).toBe(0);
    expect(await database.session.count()).toBe(0);
    // Replaying the old cookie no longer works: the session is gone server-side.
    expect((await getMe(cookies)).statusCode).toBe(401);
  });

  it("only ends the current session, not the user's other devices", async () => {
    const firstDevice = await registerAda();
    const login = await post("/login", { email: ada.email, password: ada.password });
    const secondDevice = { [SESSION_COOKIE_NAME]: sessionCookie(login).value };

    await post("/logout", undefined, firstDevice);

    expect((await getMe(firstDevice)).statusCode).toBe(401);
    expect((await getMe(secondDevice)).statusCode).toBe(200);
  });

  it("succeeds when there is no session", async () => {
    expect((await post("/logout")).statusCode).toBe(204);
  });
});

describe("CSRF protection", () => {
  it("rejects state-changing requests from another origin", async () => {
    const cookies = await registerAda();

    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { origin: "https://evil.example" },
      cookies,
    });

    expect(response.statusCode).toBe(403);
    expect(errorOf(response).code).toBe("FORBIDDEN_ORIGIN");
    expect(await database.session.count()).toBe(1);
  });

  it("rejects cross-site requests that carry no Origin header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { "sec-fetch-site": "cross-site" },
    });

    expect(response.statusCode).toBe(403);
  });
});
