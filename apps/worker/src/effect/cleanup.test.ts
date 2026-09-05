import { describe, expect, it, vi } from "vitest";
import { cleanupPreservingPrimary } from "./cleanup";

describe("cleanupPreservingPrimary", () => {
  it("reports synchronous cleanup throws without changing their identity", async () => {
    const cleanupError = new Error("synchronous cleanup");
    const onCleanupFailure = vi.fn();
    await expect(
      cleanupPreservingPrimary({
        cleanup: () => {
          throw cleanupError;
        },
        hasPrimaryFailure: false,
        onCleanupFailure,
      }),
    ).rejects.toBe(cleanupError);
    expect(onCleanupFailure).toHaveBeenCalledWith(cleanupError);
  });

  it.each([false, true])(
    "retains undefined rejection with primary failure=%s",
    async (hasPrimaryFailure) => {
      const onCleanupFailure = vi.fn();
      const result = cleanupPreservingPrimary({
        // oxlint-disable-next-line prefer-promise-reject-errors -- Third-party cleanup can reject without an Error; preserve that boundary behavior.
        cleanup: () => Promise.reject(),
        hasPrimaryFailure,
        onCleanupFailure,
      });
      await (hasPrimaryFailure
        ? expect(result).resolves.toBeUndefined()
        : expect(result).rejects.toBeUndefined());
      expect(onCleanupFailure).toHaveBeenCalledWith(undefined);
    },
  );

  it("propagates a failure from the cleanup reporter", async () => {
    const reporterError = new Error("reporter");
    await expect(
      cleanupPreservingPrimary({
        cleanup: () => Promise.reject(new Error("cleanup")),
        hasPrimaryFailure: true,
        onCleanupFailure: () => {
          throw reporterError;
        },
      }),
    ).rejects.toBe(reporterError);
  });

  it("keeps a primary failure while reporting cleanup failure", async () => {
    const onCleanupFailure = vi.fn();
    await expect(
      cleanupPreservingPrimary({
        cleanup: () => Promise.reject(new Error("cleanup")),
        hasPrimaryFailure: true,
        onCleanupFailure,
      }),
    ).resolves.toBeUndefined();
    expect(onCleanupFailure).toHaveBeenCalledOnce();
  });

  it("fails a successful operation when mandatory cleanup fails", async () => {
    const cleanupError = new Error("cleanup");
    await expect(
      cleanupPreservingPrimary({
        cleanup: () => Promise.reject(cleanupError),
        hasPrimaryFailure: false,
        onCleanupFailure: vi.fn(),
      }),
    ).rejects.toBe(cleanupError);
  });
});
