import type { z } from "zod";

export class EnvValidationError extends Error {
  constructor(issues: z.core.$ZodIssue[]) {
    const details = issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    super(`Invalid environment variables:\n${details}`);
    this.name = "EnvValidationError";
  }
}

/**
 * Validates environment variables against a schema and returns the typed result.
 * Throws an EnvValidationError listing every problem, so a misconfigured
 * service fails at startup instead of at first use.
 */
export function parseEnv<TSchema extends z.ZodType>(
  schema: TSchema,
  source: Record<string, string | undefined> = process.env,
): z.infer<TSchema> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}
