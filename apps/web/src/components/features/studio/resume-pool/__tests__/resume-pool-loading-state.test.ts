import { describe, expect, it } from "vitest";
import { shouldShowStudioListLoadingState } from "../../studio-list-loading-state";

describe("resume pool loading state", () => {
  it("keeps the empty state hidden while a filtered pool query is refetching", () => {
    expect(
      shouldShowStudioListLoadingState({
        isInitialLoading: false,
        isRefetching: true,
        recordCount: 0,
      }),
    ).toBe(true);
  });

  it("keeps existing pool records visible during a background refresh", () => {
    expect(
      shouldShowStudioListLoadingState({
        isInitialLoading: false,
        isRefetching: true,
        recordCount: 12,
      }),
    ).toBe(false);
  });
});
