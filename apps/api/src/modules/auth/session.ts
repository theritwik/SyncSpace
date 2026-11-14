import { createHash, randomBytes } from "node:crypto";

import type { PrismaClient, User } from "@syncspace/database";
import { SESSION_COOKIE_NAME } from "@syncspace/shared";
import type { FastifyRequest } from "fastify";

import { HttpError } from "../../http/errors.js";

/**
 * Sessions are "opaque tokens": the cookie holds a random value with no
 * meaning of its own, and the server looks it up in the `sessions` table on
 * every request. Deleting the row (logout) invalidates the session instantly.
 *
 * Only a SHA-256 hash of the token is stored. Someone who can read the
 * database therefore cannot copy a token into their browser and impersonate a
 * user. A fast hash is enough here (unlike for passwords) because the token
 * is 256 bits of randomness and cannot be guessed.
 */
function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(
  db: PrismaClient,
  userId: string,
  ttlMs: number,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs);

  await db.session.create({
    data: { tokenHash: hashSessionToken(token), userId, expiresAt },
  });

  return { token, expiresAt };
}

/** Returns the user that owns a valid, unexpired session token, or null. */
export async function findSessionUser(db: PrismaClient, token: string): Promise<User | null> {
  const session = await db.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    // deleteMany does not throw if a concurrent request already removed the row.
    await db.session.deleteMany({ where: { id: session.id } });
    return null;
  }

  return session.user;
}

export async function deleteSession(db: PrismaClient, token: string): Promise<void> {
  await db.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

export function deleteExpiredSessions(db: PrismaClient, userId: string): Promise<unknown> {
  return db.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
}

/**
 * Guard for protected routes: returns the signed-in user or throws 401.
 * Call it at the top of any handler that requires authentication.
 */
export async function requireUser(db: PrismaClient, request: FastifyRequest): Promise<User> {
  const token = request.cookies[SESSION_COOKIE_NAME];
  const user = token ? await findSessionUser(db, token) : null;
  if (!user) {
    throw new HttpError(401, "UNAUTHENTICATED", "You are not signed in.");
  }
  return user;
}
