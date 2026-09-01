import "dotenv/config";

import * as Sentry from "@sentry/nestjs";

const dsn =
  process.env.SENTRY_BACKEND_DSN?.trim() ||
  process.env.SENTRY_WORKER_DSN?.trim() ||
  process.env.SENTRY_DSN?.trim();

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  sendDefaultPii: false,
  tracesSampleRate: Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || "0"),
});
