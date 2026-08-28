import { createSentryOptions, resolveSentryDsn } from "@arc/shared/sentry";
import * as Sentry from "@sentry/hono/node";

export const createWorkerSentryOptions = () =>
  createSentryOptions({
    dsn: resolveSentryDsn(process.env, "SENTRY_WORKER_DSN"),
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    runtime: "worker",
  });

export const initializeWorkerSentry = () => {
  const options = createWorkerSentryOptions();
  if (options) {
    Sentry.init(options);
  }
};

// oxlint-disable-next-line anti-slop/no-object-parameters, anti-slop/no-unknown-parameters -- Process and queue error boundaries receive arbitrary thrown values plus bounded diagnostic context.
export const captureWorkerException = (error: unknown, operation: string, context?: object) => {
  Sentry.captureException(error, {
    extra: context ? { ...context } : undefined,
    tags: { "arc.operation": operation },
  });
};

export const flushWorkerSentry = (timeout = 2000) => Sentry.flush(timeout);

export const reportQueueFailure =
  (queue: string) => (job: { id?: string } | undefined, error: Error) => {
    captureWorkerException(error, "worker.job.failed", {
      jobId: job?.id,
      queue,
    });
  };
