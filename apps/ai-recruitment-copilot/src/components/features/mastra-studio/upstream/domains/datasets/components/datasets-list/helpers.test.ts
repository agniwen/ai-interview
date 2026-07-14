import { describe, expect, it } from "vitest";
import { getDatasetTargetTypes, matchesDatasetTargetFilter } from "./helpers";

describe("dataset target filtering", () => {
  it("prefers the persisted target type", () => {
    expect(getDatasetTargetTypes("workflow", [{ targetType: "agent" }])).toEqual(["workflow"]);
  });

  it("derives stable unique target types for legacy datasets", () => {
    expect(
      getDatasetTargetTypes(null, [
        { targetType: "workflow" },
        { targetType: "agent" },
        { targetType: "agent" },
      ]),
    ).toEqual(["agent", "workflow"]);
  });

  it("matches specific, untyped, and all filters", () => {
    expect(matchesDatasetTargetFilter(["agent"], "agent")).toBe(true);
    expect(matchesDatasetTargetFilter([], "none")).toBe(true);
    expect(matchesDatasetTargetFilter(["workflow"], "all")).toBe(true);
  });
});
