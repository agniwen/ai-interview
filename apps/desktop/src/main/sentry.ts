import { createSentryOptions, resolveSentryDsn } from "@app/shared/sentry";
import * as Sentry from "@sentry/electron/main";

const initializeDesktopMainSentry = () => {
  const options = createSentryOptions({
    dsn: resolveSentryDsn(import.meta.env, "SENTRY_DESKTOP_DSN"),
    environment: import.meta.env.MODE,
    release: import.meta.env.SENTRY_RELEASE,
    runtime: "desktop-main",
  });
  if (options) {
    Sentry.init(options);
  }
};

initializeDesktopMainSentry();

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Electron process error events expose arbitrary rejection reasons.
export const captureDesktopMainException = (error: unknown, operation: string) => {
  Sentry.captureException(error, { tags: { "arc.operation": operation } });
};
