import { describe, expect, it, vi } from "vitest";
import { captureAsync, runAsyncAction, withCleanup } from "../async-control";

describe("async control helpers", () => {
  it("captures successful and failed operations", async () => {
    await expect(captureAsync(() => "ok")).resolves.toEqual({
      ok: true,
      value: "ok",
    });

    const error = new Error("failed");
    await expect(
      captureAsync(() => {
        throw error;
      }),
    ).resolves.toEqual({ error, ok: false });
  });

  it("runs cleanup after both success and failure", async () => {
    const cleanup = vi.fn();
    await expect(withCleanup(() => 1, cleanup)).resolves.toBe(1);
    expect(cleanup).toHaveBeenCalledTimes(1);

    await expect(
      withCleanup(() => {
        throw new Error("failed");
      }, cleanup),
    ).rejects.toThrow("failed");
    expect(cleanup).toHaveBeenCalledTimes(2);
  });

  it("reports action failures and still performs cleanup", async () => {
    const cleanup = vi.fn();
    const onError = vi.fn();
    const error = new Error("failed");

    await expect(
      runAsyncAction({
        cleanup,
        onError,
        operation: () => {
          throw error;
        },
      }),
    ).resolves.toEqual({ error, ok: false });
    expect(onError).toHaveBeenCalledWith(error);
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
