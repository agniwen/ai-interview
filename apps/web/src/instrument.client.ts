import { createSentryOptions, resolveSentryDsn } from "@app/shared/sentry";
import * as Sentry from "@sentry/tanstackstart-react";

const options = createSentryOptions({
  dsn: resolveSentryDsn(import.meta.env, "SENTRY_WEB_DSN"),
  environment: import.meta.env.MODE,
  nodeEnvironment: process.env.NODE_ENV,
  release: import.meta.env.SENTRY_RELEASE,
  runtime: "web-client",
});

if (options) {
  Sentry.init(options);
}
