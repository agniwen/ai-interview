import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const floatingPopupSources = [
  "../popover.tsx",
  "../select.tsx",
  "../context-menu.tsx",
  "../hover-card.tsx",
  "../../reui/cascader/cascader.tsx",
  "../../reui/cascader/cascader-footer.tsx",
].map((path) => ({
  path,
  source: readFileSync(new URL(path, import.meta.url), "utf-8"),
}));
const cossStyleSource = readFileSync(new URL("../coss-style.ts", import.meta.url), "utf-8");

describe("floating popup motion", () => {
  it.each(floatingPopupSources)(
    "$path uses interruptible Base UI lifecycle transitions",
    ({ source }) => {
      expect(source).toContain("cossAnchoredPopupMotionClass");
      expect(source).not.toContain("data-open:animate-in");
      expect(source).not.toContain("data-closed:animate-out");
    },
  );

  it("defines one transitions.dev recipe for every anchored popup", () => {
    expect(cossStyleSource).toContain("transition-[scale,opacity]");
    expect(cossStyleSource).toContain("duration-[var(--duration-fast)]");
    expect(cossStyleSource).toContain("ease-[var(--ease-smooth-out)]");
    expect(cossStyleSource).toContain("data-starting-style:opacity-0");
    expect(cossStyleSource).toContain("data-starting-style:scale-(--scale-medium)");
    expect(cossStyleSource).toContain("data-ending-style:opacity-0");
    expect(cossStyleSource).toContain("data-ending-style:scale-(--scale-tiny)");
    expect(cossStyleSource).toContain("data-ending-style:duration-[var(--duration-quick)]");
    expect(cossStyleSource).toContain("motion-reduce:transition-none");
  });
});
