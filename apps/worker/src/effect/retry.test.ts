import { Data, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it, vi } from "vitest";
import {
  getExternalRetryAfter,
  isTransientExternalFailure,
  retryTransient,
  retryTransientPromise,
} from "./retry";

class DependencyFailure extends Data.TaggedError("DependencyFailure")<{
  readonly retryable: boolean;
}> {}

describe("retryTransient", () => {
  it("does not retry a permanent failure", async () => {
    let attempts = 0;
    const program = retryTransient(
      () => {
        attempts += 1;
        return Effect.fail(new DependencyFailure({ retryable: false }));
      },
      {
        isTransient: (error) => error.retryable,
      },
    ).pipe(Effect.exit);

    const exit = await Effect.runPromise(program);

    expect(exit._tag).toBe("Failure");
    expect(attempts).toBe(1);
  });

  it("retries a transient failure at most twice", async () => {
    let attempts = 0;
    const program = Effect.gen(function* program() {
      const fiber = yield* retryTransient(
        () => {
          attempts += 1;
          return Effect.fail(new DependencyFailure({ retryable: true }));
        },
        {
          baseDelay: "1 second",
          isTransient: (error) => error.retryable,
        },
      ).pipe(Effect.exit, Effect.forkChild);

      yield* TestClock.adjust("10 seconds");
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer()));

    const exit = await Effect.runPromise(program);

    expect(exit._tag).toBe("Failure");
    expect(attempts).toBe(3);
  });
});

describe("external failure classification", () => {
  it("accepts only explicit provider or transport retry signals", () => {
    expect(isTransientExternalFailure({ $metadata: { httpStatusCode: 503 } })).toBe(true);
    expect(isTransientExternalFailure({ code: "ECONNRESET" })).toBe(true);
    expect(isTransientExternalFailure(new Error("socket maybe closed"))).toBe(false);
  });

  it("reads explicit retry delays without guessing from messages", () => {
    expect(getExternalRetryAfter({ retryAfterMs: 1200 })).toBe(1200);
    expect(getExternalRetryAfter({ $response: { headers: { "retry-after": "2" } } })).toBe(2000);
    expect(getExternalRetryAfter(new Error("retry after 5 seconds"))).toBeUndefined();
  });

  it("preserves the original error after bounded Promise retries", async () => {
    const error = Object.assign(new Error("unavailable"), { code: "ETIMEDOUT" });
    const operation = vi.fn().mockRejectedValue(error);
    await expect(retryTransientPromise(operation, { baseDelay: 0, maxRetries: 2 })).rejects.toBe(
      error,
    );
    expect(operation).toHaveBeenCalledTimes(3);
  });
});
