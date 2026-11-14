import type { ApiErrorCode, ApiErrorDetail, ApiErrorResponse } from "@syncspace/shared";
import type { FastifyInstance } from "fastify";
import type { z } from "zod";

/**
 * An error that is safe to show to the client. Route handlers throw it and
 * the error handler below turns it into the standard JSON error response.
 */
export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function tooManyAttempts(): HttpError {
  return new HttpError(429, "RATE_LIMITED", "Too many attempts. Please try again later.");
}

/** Parses untrusted input with a Zod schema, or throws a 400 listing every invalid field. */
export function validate<TSchema extends z.ZodType>(schema: TSchema, input: unknown): z.infer<TSchema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Some fields are invalid.",
      result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return result.data;
}

function errorBody(code: ApiErrorCode, message: string, details?: ApiErrorDetail[]): ApiErrorResponse {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

export function registerErrorHandlers(app: FastifyInstance): void {
  app.setNotFoundHandler((_request, reply) => {
    reply.code(404).send(errorBody("NOT_FOUND", "Route not found."));
  });

  app.setErrorHandler((error, request, reply) => {
    reply.header("cache-control", "no-store");

    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(errorBody(error.code, error.message, error.details));
    }

    // Errors raised by Fastify itself for malformed requests (invalid JSON,
    // unsupported content type, body too large). Their messages are generic
    // and safe to return.
    const statusCode = (error as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === "number" && statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(errorBody("BAD_REQUEST", (error as Error).message));
    }

    // Anything else is a bug or an infrastructure failure. Log the details
    // for us; tell the client nothing about the internals.
    request.log.error({ err: error }, "Unhandled error");
    return reply
      .code(500)
      .send(errorBody("INTERNAL_ERROR", "Something went wrong. Please try again."));
  });
}
