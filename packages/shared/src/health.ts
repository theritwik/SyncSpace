import { z } from "zod";

export const dependencyStatusSchema = z.enum(["up", "down"]);

/** Response contract of `GET /api/v1/health`, shared by the API and its consumers. */
export const apiHealthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  service: z.literal("api"),
  timestamp: z.iso.datetime(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.object({
    database: dependencyStatusSchema,
  }),
});

export type DependencyStatus = z.infer<typeof dependencyStatusSchema>;
export type ApiHealthResponse = z.infer<typeof apiHealthResponseSchema>;
