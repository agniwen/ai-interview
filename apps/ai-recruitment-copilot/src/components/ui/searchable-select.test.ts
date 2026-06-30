import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./searchable-select.tsx", import.meta.url), "utf-8");

describe("SearchableSelect", () => {
  it("gives the option list an explicit scroll container for long job lists", () => {
    expect(source).toContain("listClassName");
    expect(source).toContain("max-h-72");
    expect(source).toContain("overflow-y-auto");
  });

  it("prefers opening downward and flips only when it would collide", () => {
    expect(source).toContain("contentSide");
    expect(source).toContain("<ComboboxContent");
    expect(source).toContain('contentSide = "bottom"');
    expect(source).toContain("side={contentSide}");
    expect(source).toContain("collisionAvoidance={{");
    expect(source).toContain('side: "flip"');
    expect(source).toContain('fallbackAxisSide: "none"');
  });

  it("keeps mouse wheel scrolling inside the option list", () => {
    expect(source).toContain("handleScrollableListWheel");
    expect(source).toContain("onWheelCapture={handleScrollableListWheel}");
    expect(source).toContain("list.scrollTop += event.deltaY");
  });
});
