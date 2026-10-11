import * as Sentry from "@sentry/hono/node";

// The host process initializes Sentry; shared workflows only report into it.
// oxlint-disable-next-line anti-slop/no-object-parameters, anti-slop/no-unknown-parameters -- Error handlers receive arbitrary thrown values and bounded diagnostic context by contract.
export const captureBackendException = (error: unknown, operation: string, context?: object) => {
  Sentry.captureException(error, {
    extra: context ? { ...context } : undefined,
    tags: { "arc.operation": operation },
  });
};
