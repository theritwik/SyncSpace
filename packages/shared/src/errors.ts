import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "BAD_REQUEST",
  "VALIDATION_ERROR",
  "INVALID_CREDENTIALS",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "FORBIDDEN_ORIGIN",
  "NOT_FOUND",
  "EMAIL_TAKEN",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
]);

/**
 * Every non-2xx API response has this shape, so clients need exactly one
 * error-handling path. `details` lists per-field problems for validation errors.
 */
export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    details: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  }),
});

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
export type ApiErrorDetail = NonNullable<ApiErrorResponse["error"]["details"]>[number];
