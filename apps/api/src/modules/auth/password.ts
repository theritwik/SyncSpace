import argon2 from "argon2";

/**
 * Hashes a password with Argon2id, the algorithm OWASP recommends first.
 *
 * A password hash is one-way and deliberately slow and memory-hungry, so a
 * stolen database cannot be turned back into passwords by brute force. Each
 * hash embeds its own random salt and parameters (PHC string format), which
 * is why nothing but this string needs to be stored.
 *
 * Library defaults are used: 64 MiB memory, 3 iterations, parallelism 4,
 * which is above OWASP's minimum recommendation.
 */
export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(passwordHash, password);
  } catch {
    // A malformed stored hash must read as "wrong password", not crash the login.
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * A valid hash of a throwaway value. Login verifies against it when the email
 * is unknown, so "no such user" takes as long as "wrong password" and response
 * time does not reveal which emails are registered.
 */
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword("dummy-password-for-timing-equalisation");
  return dummyHash;
}
