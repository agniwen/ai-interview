import { setImmediate as nextEventLoopTurn } from "node:timers/promises";
import { Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createWorkerLifecycle, trackWorkerRecoveryRun } from "./lifecycle";

describe("trackWorkerRecoveryRun", () => {
  it("keeps running work available for shutdown draining and removes completed work", async () => {
    const activeRuns = new Set<Promise<void>>();
    const pending = Promise.withResolvers<boolean>();
    const active = trackWorkerRecoveryRun(activeRuns, async () => {
      await pending.promise;
    });

    expect(activeRuns.has(active)).toBe(true);
    pending.resolve(true);
    await active;
    expect(activeRuns.size).toBe(0);
  });

  it("preserves a handled failure without leaving an unhandled cleanup rejection", async () => {
    const activeRuns = new Set<Promise<void>>();
    const failure = new Error("module unavailable");
    const active = trackWorkerRecoveryRun(activeRuns, () => Promise.reject(failure));

    await expect(active).rejects.toBe(failure);
    // Let Node report any unhandled rejection created by the cleanup observer.
    await nextEventLoopTurn();
    expect(activeRuns.size).toBe(0);
  });
});

describe("createWorkerLifecycle", () => {
  it("closes every acquired resource in reverse order", async () => {
    const events: string[] = [];
    const lifecycle = createWorkerLifecycle(() => {});
    lifecycle.addFinalizer("first", () => {
      events.push("first");
    });
    lifecycle.addFinalizer("second", () => {
      events.push("second");
    });

    await lifecycle.close();

    expect(events).toEqual(["second", "first"]);
  });

  it("reports cleanup failure and continues finalization", async () => {
    const events: string[] = [];
    const onFailure = vi.fn();
    const lifecycle = createWorkerLifecycle(onFailure);
    lifecycle.addFinalizer("first", () => {
      events.push("first");
    });
    lifecycle.addFinalizer("second", () => {
      throw new Error("close failed");
    });

    await expect(lifecycle.close()).rejects.toThrow("close failed");

    expect(events).toEqual(["first"]);
    expect(onFailure).toHaveBeenCalledWith({
      cause: expect.objectContaining({ message: "close failed" }),
      resource: "second",
    });
  });

  it("does not replace an existing primary failure with cleanup failure", async () => {
    const onFailure = vi.fn();
    const lifecycle = createWorkerLifecycle(onFailure);
    lifecycle.addFinalizer("resource", () => {
      throw new Error("cleanup failed");
    });

    await expect(lifecycle.close(Exit.fail(new Error("primary failed")))).resolves.toBeUndefined();
    expect(onFailure).toHaveBeenCalledOnce();
  });
});
