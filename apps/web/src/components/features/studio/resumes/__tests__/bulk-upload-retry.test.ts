import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/client/api/errors";
import { retryBulkUploadRequest } from "../bulk-upload-retry";

afterEach(() => vi.useRealTimers());

describe("bounded upload retry", () => {
  it("honors Retry-After without exceeding the wait budget", async () => {
    vi.useFakeTimers();
    const operation = vi
      .fn()
      .mockRejectedValue(new ApiError("限流", { retryAfterMs: 10_000, status: 429 }));
    const outcome = expect(
      retryBulkUploadRequest(operation, new AbortController().signal),
    ).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(9999);
    expect(operation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(operation).toHaveBeenCalledTimes(2);
    await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("times out each stalled request and stops after three attempts", async () => {
    vi.useFakeTimers();
    const operation = vi.fn((signal: AbortSignal) => {
      const deferred = Promise.withResolvers<string>();
      signal.addEventListener("abort", () => deferred.reject(signal.reason), { once: true });
      return deferred.promise;
    });
    const outcome = expect(
      retryBulkUploadRequest(operation, new AbortController().signal),
    ).rejects.toMatchObject({ name: "TimeoutError" });
    await vi.runAllTimersAsync();
    expect(operation).toHaveBeenCalledTimes(3);
    await outcome;
    expect(vi.getTimerCount()).toBe(0);
  });
});
