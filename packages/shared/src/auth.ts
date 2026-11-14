import { z } from "zod";

/** Name of the HttpOnly cookie that carries the session token. */
export const SESSION_COOKIE_NAME = "syncspace_session";

export const PASSWORD_MIN_LENGTH = 10;
// An upper bound keeps hashing cost predictable (very long inputs are a cheap DoS vector).
export const PASSWORD_MAX_LENGTH = 128;

// Emails are trimmed and lower-cased before validation so that
// "Ada@Example.com " and "ada@example.com" are the same account.
const emailSchema = z
  .string("Enter your email address.")
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "Email is too long."));

export const registerRequestSchema = z.object({
  name: z
    .string("Enter your name.")
    .trim()
    .min(1, "Enter your name.")
    .max(80, "Name must be at most 80 characters."),
  email: emailSchema,
  password: z
    .string("Enter a password.")
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`),
});

// Login deliberately does not re-apply the password policy: it only needs
// "something was typed". Whether it is correct is decided by the hash check.
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z
    .string("Enter your password.")
    .min(1, "Enter your password.")
    .max(PASSWORD_MAX_LENGTH, "Invalid password."),
});

/** The user fields that are safe to send to a client. Never includes the password hash. */
export const userSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  createdAt: z.iso.datetime(),
});

/** Response of register, login and `GET /auth/me`. */
export const authResponseSchema = z.object({
  user: userSchema,
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type PublicUser = z.infer<typeof userSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
