import { describe, expect, it, vi } from "vitest";
import { cleanupPreservingPrimary } from "./cleanup";

describe("cleanupPreservingPrimary", () => {
  it("keeps a primary failure while reporting cleanup failure", async () => {
    const onCleanupFailure = vi.fn();
    await expect(
      cleanupPreservingPrimary({
        cleanup: () => Promise.reject(new Error("cleanup")),
        hasPrimaryFailure: true,
        onCleanupFailure,
        primaryCause: new Error("primary"),
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
        primaryCause: undefined,
      }),
    ).rejects.toBe(cleanupError);
  });
});
