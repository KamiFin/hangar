import { z } from "zod";
import { SEVERITIES } from "./domain";

// TypeScript types are erased at runtime, so everything that enters the API is parsed here.

export const createWorkOrderSchema = z.object({
  aircraftId: z.number().int().positive(),
  title: z.string().trim().min(3, "Title needs at least 3 characters").max(120),
  severity: z.enum(SEVERITIES),
});
export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;

export const flightsQuerySchema = z.object({
  cursor: z.string().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const explainQuerySchema = z.object({
  aircraftId: z.coerce.number().int().positive().default(1),
});

export const idempotencyKeySchema = z.uuid();
