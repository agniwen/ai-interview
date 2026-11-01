import { createSentryOptions, resolveSentryDsn } from "@app/shared/sentry";
import * as Sentry from "@sentry/tanstackstart-react";
import { isMediaDeviceError, isUnhandledRejectionEvent } from "@/lib/client/media-device-errors";

const options = createSentryOptions({
  dsn: resolveSentryDsn(import.meta.env, "SENTRY_WEB_DSN"),
  environment: import.meta.env.MODE,
  nodeEnvironment: process.env.NODE_ENV,
  release: import.meta.env.SENTRY_RELEASE,
  runtime: "web-client",
});

if (options) {
  Sentry.init({
    ...options,
    // Meeting participants already get a toast for these LiveKit device-switch
    // failures, so they are not application errors.
    beforeSend: (event, hint) =>
      isUnhandledRejectionEvent(event) && isMediaDeviceError(hint.originalException)
        ? null
        : options.beforeSend(event),
  });
}
