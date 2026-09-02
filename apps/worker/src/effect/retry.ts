// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/require-safety-comment-for-type-assertion, promise/prefer-await-to-callbacks, func-names -- Third-party transport errors are unknown at this boundary; Effect catch/retry APIs are callback-based.
import { Clock, Duration, Effect, Random } from "effect";

const DEFAULT_BASE_DELAY_MS = 250;
const DEFAULT_MAX_DELAY_MS = 2000;
const DEFAULT_MAX_RETRIES = 2;
const MAX_RETRY_AFTER_MS = 30_000;

export interface RetryTransientOptions<E> {
  readonly baseDelay?: Duration.Input;
  readonly deadlineAt?: number;
  readonly isTransient: (error: E) => boolean;
  readonly maxDelay?: Duration.Input;
  readonly maxRetries?: number;
  readonly onRetry?: (input: {
    readonly attempt: number;
    readonly delayMs: number;
    readonly error: E;
  }) => void;
  readonly retryAfter?: (error: E) => Duration.Input | undefined;
}

interface RetryableExternalFailure {
  readonly $metadata?: { readonly httpStatusCode?: number };
  readonly $response?: { readonly headers?: Record<string, string | undefined> };
  readonly $retryable?: unknown;
  readonly code?: unknown;
  readonly name?: unknown;
  readonly retryAfterMs?: unknown;
}

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ETIMEDOUT",
]);

// Uses provider retry metadata and explicit transport codes only. Unknown-result failures stay
// non-retryable until the owning capability can prove the operation is safe to repeat.
export function isTransientExternalFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const candidate = error as RetryableExternalFailure;
  const status = candidate.$metadata?.httpStatusCode;
  return (
    Boolean(candidate.$retryable) ||
    status === 429 ||
    (status !== undefined && status >= 500) ||
    (typeof candidate.code === "string" && TRANSIENT_NETWORK_CODES.has(candidate.code)) ||
    candidate.name === "TimeoutError"
  );
}

export function getExternalRetryAfter(error: unknown): Duration.Input | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }
  const candidate = error as RetryableExternalFailure;
  if (
    typeof candidate.retryAfterMs === "number" &&
    Number.isFinite(candidate.retryAfterMs) &&
    candidate.retryAfterMs >= 0
  ) {
    return candidate.retryAfterMs;
  }
  const header = candidate.$response?.headers?.["retry-after"];
  if (!header) {
    return undefined;
  }
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

function boundedDelay(input: {
  baseDelayMs: number;
  maxDelayMs: number;
  retryAfter: Duration.Input | undefined;
  retryIndex: number;
  random: number;
}): number {
  if (input.retryAfter !== undefined) {
    return Math.min(Duration.toMillis(input.retryAfter), MAX_RETRY_AFTER_MS);
  }
  const exponential = input.baseDelayMs * 2 ** input.retryIndex;
  const jittered = exponential * (0.5 + input.random);
  return Math.min(Math.max(0, Math.round(jittered)), input.maxDelayMs);
}

// Retries only typed transient failures. Callers retain ownership of idempotency and durable job retries.
export function retryTransient<A, E, R>(
  operation: () => Effect.Effect<A, E, R>,
  options: RetryTransientOptions<E>,
): Effect.Effect<A, E, R> {
  const baseDelayMs = Duration.toMillis(options.baseDelay ?? DEFAULT_BASE_DELAY_MS);
  const maxDelayMs = Duration.toMillis(options.maxDelay ?? DEFAULT_MAX_DELAY_MS);
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  const run = (retryIndex: number): Effect.Effect<A, E, R> =>
    operation().pipe(
      Effect.catchIf(
        (error) => options.isTransient(error) && retryIndex < maxRetries,
        (error) =>
          Effect.gen(function* () {
            const random = yield* Random.next;
            const delayMs = boundedDelay({
              baseDelayMs,
              maxDelayMs,
              random,
              retryAfter: options.retryAfter?.(error),
              retryIndex,
            });
            if (options.deadlineAt !== undefined) {
              const now = yield* Clock.currentTimeMillis;
              if (now + delayMs > options.deadlineAt) {
                return yield* Effect.fail(error);
              }
            }
            yield* Effect.sync(() =>
              options.onRetry?.({ attempt: retryIndex + 2, delayMs, error }),
            );
            yield* Effect.sleep(delayMs);
            return yield* run(retryIndex + 1);
          }),
      ),
    );

  return Effect.suspend(() => run(0));
}

export function retryTransientPromise<A>(
  operation: () => Promise<A>,
  options: Omit<RetryTransientOptions<unknown>, "isTransient"> & {
    readonly isTransient?: (error: unknown) => boolean;
  } = {},
): Promise<A> {
  return Effect.runPromise(
    retryTransient(() => Effect.tryPromise({ catch: (cause) => cause, try: operation }), {
      ...options,
      isTransient: options.isTransient ?? isTransientExternalFailure,
      retryAfter: options.retryAfter ?? getExternalRetryAfter,
    }),
  );
}
