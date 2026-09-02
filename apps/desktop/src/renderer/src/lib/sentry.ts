import { createSentryOptions, resolveSentryDsn } from "@app/shared/sentry";
import * as Sentry from "@sentry/electron/renderer";

const initializeDesktopRendererSentry = () => {
  const options = createSentryOptions({
    dsn: resolveSentryDsn(import.meta.env, "SENTRY_DESKTOP_DSN"),
    environment: import.meta.env.MODE,
    release: import.meta.env.SENTRY_RELEASE,
    runtime: "desktop-renderer",
  });
  if (options) {
    Sentry.init(options);
  }
};

initializeDesktopRendererSentry();

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- React and Router error boundaries expose arbitrary thrown values.
export const captureDesktopRendererException = (error: unknown, operation: string) => {
  Sentry.captureException(error, { tags: { "arc.operation": operation } });
};
