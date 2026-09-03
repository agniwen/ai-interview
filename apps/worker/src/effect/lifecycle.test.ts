import { Exit } from "effect";
import { describe, expect, it, vi } from "vitest";
import { createWorkerLifecycle } from "./lifecycle";

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
