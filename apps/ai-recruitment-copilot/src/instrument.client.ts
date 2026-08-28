import { createSentryOptions, resolveSentryDsn } from "@arc/shared/sentry";
import * as Sentry from "@sentry/tanstackstart-react";

const options = createSentryOptions({
  dsn: resolveSentryDsn(import.meta.env, "SENTRY_WEB_DSN"),
  environment: import.meta.env.MODE,
  release: import.meta.env.SENTRY_RELEASE,
  runtime: "web-client",
});

if (options) {
  Sentry.init(options);
}
