/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly SENTRY_DESKTOP_DSN?: string;
  readonly SENTRY_DSN?: string;
  readonly SENTRY_RELEASE?: string;
  readonly VITE_BASE_URL?: string;
  readonly VITE_BETTER_AUTH_URL?: string;
  readonly VITE_RECORDING_R2_UPLOAD_ORIGIN?: string;
}
