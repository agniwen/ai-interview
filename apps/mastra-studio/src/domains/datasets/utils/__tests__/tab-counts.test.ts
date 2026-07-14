import { describe, expect, it } from "vitest";
import { getItemsTabCount } from "../tab-counts";

describe("dataset tab counts", () => {
  describe("getItemsTabCount", () => {
    it("returns filtered row count while search is active", () => {
      expect(
        getItemsTabCount({
          filteredItemsLength: 7,
          hasSearchQuery: true,
          itemsTotal: 150,
          unfilteredItemsTotal: 150,
        }),
      ).toBe(7);
    });

    it("returns unfiltered total when no search query is active", () => {
      expect(
        getItemsTabCount({
          filteredItemsLength: 20,
          hasSearchQuery: false,
          itemsTotal: 150,
          unfilteredItemsTotal: 150,
        }),
      ).toBe(150);
    });

    it("falls back to items total when unfiltered total is not yet available", () => {
      expect(
        getItemsTabCount({
          filteredItemsLength: 20,
          hasSearchQuery: false,
          itemsTotal: 35,
          unfilteredItemsTotal: undefined,
        }),
      ).toBe(35);
    });

    it("falls back to filtered row count when both totals are unavailable", () => {
      expect(
        getItemsTabCount({
          filteredItemsLength: 12,
          hasSearchQuery: false,
          itemsTotal: undefined,
          unfilteredItemsTotal: undefined,
        }),
      ).toBe(12);
    });

    it("preserves a valid zero total", () => {
      expect(
        getItemsTabCount({
          filteredItemsLength: 20,
          hasSearchQuery: false,
          itemsTotal: 0,
          unfilteredItemsTotal: 0,
        }),
      ).toBe(0);
    });
  });
});
