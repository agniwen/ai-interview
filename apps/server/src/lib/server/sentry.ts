import { createSentryOptions, resolveSentryDsn } from "@arc/shared/sentry";
import * as Sentry from "@sentry/hono/node";

const createBackendSentryOptions = () =>
  createSentryOptions({
    dsn: resolveSentryDsn(process.env, "SENTRY_BACKEND_DSN"),
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    nodeEnvironment: process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    runtime: "backend",
  });

export const initializeBackendSentry = () => {
  const options = createBackendSentryOptions();
  if (options) {
    Sentry.init(options);
  }
};

// oxlint-disable-next-line anti-slop/no-object-parameters, anti-slop/no-unknown-parameters -- Error handlers receive arbitrary thrown values and bounded diagnostic context by contract.
export const captureBackendException = (error: unknown, operation: string, context?: object) => {
  Sentry.captureException(error, {
    extra: context ? { ...context } : undefined,
    tags: { "arc.operation": operation },
  });
};

export const flushBackendSentry = (timeout = 2000) => Sentry.flush(timeout);
