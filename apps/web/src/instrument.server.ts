import { createSentryOptions, resolveSentryDsn } from "@app/shared/sentry";
import * as Sentry from "@sentry/tanstackstart-react";

const options = createSentryOptions({
  dsn: resolveSentryDsn(process.env, "SENTRY_WEB_DSN"),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  nodeEnvironment: process.env.NODE_ENV,
  release: process.env.SENTRY_RELEASE,
  runtime: "web-server",
});

if (options) {
  Sentry.init(options);
}
