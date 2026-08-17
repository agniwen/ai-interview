import type { DehydratedState } from "@tanstack/react-query";
import { z } from "zod";
import type { JsonValue } from "@/lib/start/server-function-types";

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.boolean(),
    z.number(),
    z.string(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const queryStateSchema = z.object({
  data: jsonValueSchema,
  dataUpdateCount: z.number(),
  dataUpdatedAt: z.number(),
  error: jsonValueSchema.nullable(),
  errorUpdateCount: z.number(),
  errorUpdatedAt: z.number(),
  fetchFailureCount: z.number(),
  fetchFailureReason: jsonValueSchema.nullable(),
  fetchMeta: jsonValueSchema.nullable(),
  fetchStatus: z.enum(["fetching", "paused", "idle"]),
  isInvalidated: z.boolean(),
  status: z.enum(["pending", "error", "success"]),
});

const mutationStateSchema = z.object({
  context: jsonValueSchema.optional(),
  data: jsonValueSchema.optional(),
  error: jsonValueSchema.nullable(),
  failureCount: z.number(),
  failureReason: jsonValueSchema.nullable(),
  isPaused: z.boolean(),
  status: z.enum(["idle", "pending", "success", "error"]),
  submittedAt: z.number(),
  variables: jsonValueSchema.optional(),
});

const dehydratedStateWireSchema = z.object({
  mutations: z.array(
    z.object({
      mutationKey: z.array(jsonValueSchema).optional(),
      state: mutationStateSchema,
    }),
  ),
  queries: z.array(
    z.object({
      queryHash: z.string(),
      queryKey: z.array(jsonValueSchema),
      state: queryStateSchema,
    }),
  ),
});

const dehydratedStateSchema = z.custom<DehydratedState>(
  (value) => dehydratedStateWireSchema.safeParse(value).success,
);

export const parseDehydratedState = dehydratedStateSchema.parse;
