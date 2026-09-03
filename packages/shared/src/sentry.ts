// oxlint-disable anti-slop/no-object-parameters, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- Sentry callbacks receive third-party SDK envelopes; this module validates their runtime shape and preserves the SDK's generic event type after scrubbing.

const FILTERED_VALUE = "[Filtered]";

const SENSITIVE_KEY_PATTERN =
  /(?:authorization|cookie|token|secret|password|passcode|api[_-]?key|access[_-]?key|email|phone|mobile|contact|candidate[_-]?name|resume|transcript|prompt|recording|audio|body|content)/i;

type UnknownRecord = Record<string, unknown>;

export interface SentryEvent {
  breadcrumbs?: UnknownRecord[];
  contexts?: UnknownRecord;
  extra?: UnknownRecord;
  request?: UnknownRecord;
  user?: UnknownRecord;
}

interface CreateSentryOptionsInput {
  dsn: string | undefined;
  environment?: string;
  nodeEnvironment?: string;
  release?: string;
  runtime: string;
}

const trimmedOrUndefined = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

export const resolveSentryDsn = (environment: object, preferredVariable: string) => {
  const values = environment as Record<string, string | undefined>;
  return trimmedOrUndefined(values[preferredVariable]) ?? trimmedOrUndefined(values.SENTRY_DSN);
};

const sanitizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? FILTERED_VALUE : sanitizeValue(nestedValue),
    ]),
  );
};

const sanitizeHeaders = (headers: unknown) => {
  if (!headers || typeof headers !== "object" || Array.isArray(headers)) {
    return;
  }

  const sanitized = Object.fromEntries(
    Object.entries(headers).filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key)),
  );
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
};

export const sanitizeSentryEvent = <Event extends object>(event: Event): Event => {
  const source = event as SentryEvent;
  const sanitized = { ...source };

  if (source.extra) {
    sanitized.extra = sanitizeValue(source.extra) as UnknownRecord;
  }
  if (source.contexts) {
    sanitized.contexts = sanitizeValue(source.contexts) as UnknownRecord;
  }
  if (source.breadcrumbs) {
    sanitized.breadcrumbs = source.breadcrumbs.map((breadcrumb) => {
      const sanitizedBreadcrumb = { ...breadcrumb };
      if (breadcrumb.data) {
        sanitizedBreadcrumb.data = sanitizeValue(breadcrumb.data) as UnknownRecord;
      }
      return sanitizedBreadcrumb;
    });
  }
  if (source.request) {
    const headers = sanitizeHeaders(source.request.headers);
    sanitized.request = headers ? { headers } : {};
  }
  if (source.user) {
    sanitized.user =
      typeof source.user.id === "string" || typeof source.user.id === "number"
        ? { id: source.user.id }
        : {};
  }

  return sanitized as Event;
};

export const createSentryOptions = ({
  dsn,
  environment,
  nodeEnvironment,
  release,
  runtime,
}: CreateSentryOptionsInput) => {
  if (trimmedOrUndefined(nodeEnvironment)?.toLowerCase() === "development") {
    return null;
  }

  const normalizedDsn = trimmedOrUndefined(dsn);
  if (!normalizedDsn) {
    return null;
  }

  return {
    beforeBreadcrumb: <Breadcrumb extends object>(breadcrumb: Breadcrumb) =>
      (breadcrumb as UnknownRecord).category === "console"
        ? null
        : (sanitizeValue(breadcrumb) as Breadcrumb),
    beforeSend: <Event extends object>(event: Event) => sanitizeSentryEvent(event),
    dataCollection: {
      httpBodies: [] as never[],
      userInfo: false,
    },
    dsn: normalizedDsn,
    enableLogs: false,
    environment: trimmedOrUndefined(environment),
    initialScope: {
      tags: {
        "arc.runtime": runtime,
      },
    },
    release: trimmedOrUndefined(release),
    sendDefaultPii: false,
    tracesSampleRate: 0,
  };
};
