import { z } from "zod";
import { ApiError } from "@/lib/client/api/errors";

const MAX_ATTEMPTS = 3;
const MAX_RETRY_WAIT_MS = 15_000;
const ATTEMPT_TIMEOUT_MS = 120_000;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This parser is the boundary for arbitrary thrown values.
export function parseUploadError(error: unknown): Error {
  const parsed = z.instanceof(Error).safeParse(error);
  return parsed.success ? parsed.data : new Error("上传失败，请重试。");
}

export function isUploadAccessError(error: Error): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export function isRetryableUploadError(error: Error): boolean {
  return (
    (error instanceof ApiError && [0, 408, 429, 502, 503, 504].includes(error.status)) ||
    (error instanceof DOMException && error.name === "TimeoutError")
  );
}

export function waitForUploadRetry(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  // oxlint-disable-next-line promise/avoid-new -- A cancellable backoff needs a timer promise.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      // oxlint-disable-next-line typescript/no-use-before-define -- Both callbacks close over each other; neither runs synchronously.
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, delay);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function retryBulkUploadRequest<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  onAttempt?: (attempt: number) => void,
): Promise<T> {
  let waited = 0;
  for (let attempt = 1; ; attempt += 1) {
    signal.throwIfAborted();
    onAttempt?.(attempt);
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(
      () => controller.abort(new DOMException("上传超时，请重试。", "TimeoutError")),
      ATTEMPT_TIMEOUT_MS,
    );
    try {
      return await operation(controller.signal);
    } catch (error) {
      signal.throwIfAborted();
      if (attempt >= MAX_ATTEMPTS || !isRetryableUploadError(parseUploadError(error))) {
        throw error;
      }
      const delay =
        error instanceof ApiError && error.retryAfterMs !== null
          ? error.retryAfterMs
          : 1000 * 2 ** (attempt - 1) + Math.random() * 300;
      if (waited + delay > MAX_RETRY_WAIT_MS) {
        throw error;
      }
      waited += delay;
      // Remove the request timeout before waiting to retry.
      clearTimeout(timer);
      await waitForUploadRetry(delay, signal);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
}
