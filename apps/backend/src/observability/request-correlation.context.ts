/* oxlint-disable promise/prefer-await-to-callbacks -- AsyncLocalStorage and Sentry scope APIs require synchronous callback ownership to preserve context across the returned async chain. */
import { AsyncLocalStorage } from "node:async_hooks";
import * as Sentry from "@sentry/nestjs";
import type { JobsOptions } from "bullmq";
import { z } from "zod";

interface RequestCorrelationStore {
  correlationId: string;
}

const requestCorrelationStorage = new AsyncLocalStorage<RequestCorrelationStore>();
const correlationMetadataSchema = z.object({ correlationId: z.string().min(1) });

export function getRequestCorrelationId(): string | undefined {
  return requestCorrelationStorage.getStore()?.correlationId;
}

export function runWithRequestCorrelation<T>(correlationId: string, callback: () => T): T {
  return requestCorrelationStorage.run({ correlationId }, callback);
}

export function runWithCorrelationScope<T>(correlationId: string, callback: () => T): T {
  return Sentry.withIsolationScope((scope) => {
    scope.setTag("correlation_id", correlationId);
    scope.setContext("request_correlation", { correlationId });
    return runWithRequestCorrelation(correlationId, callback);
  });
}

export function withCorrelationJobOptions(
  options: JobsOptions,
  correlationId = getRequestCorrelationId(),
): JobsOptions {
  if (!correlationId) {
    return options;
  }
  return {
    ...options,
    telemetry: {
      ...options.telemetry,
      metadata: JSON.stringify({ correlationId }),
    },
  };
}

export function correlationIdFromJobOptions(options: JobsOptions): string | undefined {
  const metadata = options.telemetry?.metadata;
  if (!metadata) {
    return undefined;
  }
  try {
    const parsed = correlationMetadataSchema.safeParse(JSON.parse(metadata));
    return parsed.success ? parsed.data.correlationId : undefined;
  } catch {
    return undefined;
  }
}

export function runWithJobCorrelation<T>(options: JobsOptions, callback: () => T): T {
  const correlationId = correlationIdFromJobOptions(options);
  return correlationId ? runWithCorrelationScope(correlationId, callback) : callback();
}
