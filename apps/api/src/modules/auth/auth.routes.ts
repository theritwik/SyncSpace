import { isUniqueConstraintError, type PrismaClient, type User } from "@syncspace/database";
import {
  loginRequestSchema,
  registerRequestSchema,
  SESSION_COOKIE_NAME,
  type AuthResponse,
  type PublicUser,
} from "@syncspace/shared";
import type { FastifyPluginAsync, FastifyReply } from "fastify";

import { HttpError, tooManyAttempts, validate } from "../../http/errors.js";
import { getDummyPasswordHash, hashPassword, verifyPassword } from "./password.js";
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  requireUser,
} from "./session.js";

export interface AuthRoutesOptions {
  db: PrismaClient;
  sessionTtlMs: number;
  /** Send the session cookie over HTTPS only. Enabled in production. */
  secureCookies: boolean;
  rateLimits: AuthRateLimits;
}

interface RateLimit {
  max: number;
  windowMs: number;
}

export interface AuthRateLimits {
  /** Login attempts (successful or not) per client IP. Slows down one client trying many accounts. */
  loginPerIp: RateLimit;
  /** Failed logins per email address. Slows down many clients guessing one account's password. */
  loginFailuresPerAccount: RateLimit;
  /** Registrations per client IP. */
  registerPerIp: RateLimit;
}

/** Only these fields ever leave the API. The password hash stays in the database. */
function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
  };
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (app, options) => {
  const { db, sessionTtlMs, rateLimits } = options;

  // Counts failed logins per email. Unlike the per-IP limit it cannot be
  // sidestepped by switching IP addresses. It is keyed on the submitted email
  // whether or not an account exists, so it reveals nothing about registration.
  const accountLoginLimit = app.createRateLimit({
    max: rateLimits.loginFailuresPerAccount.max,
    timeWindow: rateLimits.loginFailuresPerAccount.windowMs,
    keyGenerator: (request) =>
      `login-account:${validate(loginRequestSchema, request.body).email}`,
  });

  // - httpOnly: JavaScript in the page cannot read the cookie, so an XSS bug
  //   cannot steal the session.
  // - secure: the browser only sends it over HTTPS (production).
  // - sameSite=lax: the browser does not send it on cross-site POSTs (CSRF).
  const cookieOptions = {
    path: "/",
    httpOnly: true,
    secure: options.secureCookies,
    sameSite: "lax",
  } as const;

  async function startSession(reply: FastifyReply, userId: string): Promise<void> {
    const { token, expiresAt } = await createSession(db, userId, sessionTtlMs);
    reply.setCookie(SESSION_COOKIE_NAME, token, {
      ...cookieOptions,
      expires: expiresAt,
      maxAge: Math.floor(sessionTtlMs / 1000),
    });
  }

  // Responses here depend on who is asking and must never be cached.
  app.addHook("onSend", async (_request, reply) => {
    reply.header("cache-control", "no-store");
  });

  app.post(
    "/register",
    {
      config: {
        rateLimit: {
          max: rateLimits.registerPerIp.max,
          timeWindow: rateLimits.registerPerIp.windowMs,
        },
      },
    },
    async (request, reply): Promise<AuthResponse> => {
      const { name, email, password } = validate(registerRequestSchema, request.body);
      const passwordHash = await hashPassword(password);

      let user: User;
      try {
        user = await db.user.create({ data: { name, email, passwordHash } });
      } catch (error) {
        // Rely on the database's unique index instead of "check, then insert":
        // two simultaneous sign-ups with the same email cannot both succeed.
        if (isUniqueConstraintError(error)) {
          throw new HttpError(409, "EMAIL_TAKEN", "An account with this email already exists.");
        }
        throw error;
      }

      await startSession(reply, user.id);
      reply.code(201);
      return { user: toPublicUser(user) };
    },
  );

  app.post(
    "/login",
    {
      config: {
        rateLimit: {
          max: rateLimits.loginPerIp.max,
          timeWindow: rateLimits.loginPerIp.windowMs,
        },
      },
    },
    async (request, reply): Promise<AuthResponse> => {
      const { email, password } = validate(loginRequestSchema, request.body);

      // Peek at the failure counter without increasing it. No attempts left
      // means the allowed number of failures has already been recorded.
      const accountLimit = await accountLoginLimit(request, { increment: false });
      if (!accountLimit.isAllowed && accountLimit.remaining === 0) {
        reply.header("retry-after", accountLimit.ttlInSeconds);
        throw tooManyAttempts();
      }

      const user = await db.user.findUnique({ where: { email } });
      // Always run a hash verification, even for unknown emails (see password.ts).
      const passwordMatches = await verifyPassword(
        user?.passwordHash ?? (await getDummyPasswordHash()),
        password,
      );

      if (!user || !passwordMatches) {
        await accountLoginLimit(request); // record the failed attempt
        // One message for both cases, so the response does not reveal
        // whether the email is registered.
        throw new HttpError(401, "INVALID_CREDENTIALS", "Invalid email or password.");
      }

      // Never reuse a session across logins: drop the one this browser
      // presented (if any) and issue a fresh token.
      const previousToken = request.cookies[SESSION_COOKIE_NAME];
      if (previousToken) await deleteSession(db, previousToken);
      await deleteExpiredSessions(db, user.id);

      await startSession(reply, user.id);
      return { user: toPublicUser(user) };
    },
  );

  app.post("/logout", async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE_NAME];
    if (token) await deleteSession(db, token);

    reply.clearCookie(SESSION_COOKIE_NAME, cookieOptions);
    return reply.code(204).send();
  });

  app.get("/me", async (request): Promise<AuthResponse> => {
    const user = await requireUser(db, request);
    return { user: toPublicUser(user) };
  });
};
