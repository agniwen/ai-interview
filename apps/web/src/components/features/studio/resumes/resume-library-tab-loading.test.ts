import { describe, expect, it } from "vitest";
import { shouldShowResumeLibraryLoadingState } from "./resume-library-page-list";

describe("resume library tab loading state", () => {
  it("does not expose an empty state while an empty cached tab is refetching", () => {
    expect(
      shouldShowResumeLibraryLoadingState({
        error: null,
        isInitialLoading: false,
        isRefetching: true,
        recordCount: 0,
      }),
    ).toBe(true);
  });

  it("keeps existing records visible during a background refresh", () => {
    expect(
      shouldShowResumeLibraryLoadingState({
        error: null,
        isInitialLoading: false,
        isRefetching: true,
        recordCount: 20,
      }),
    ).toBe(false);
  });
});
