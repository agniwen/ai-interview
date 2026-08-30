import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const navigationMenuSource = readFileSync(
  new URL("../navigation-menu.tsx", import.meta.url),
  "utf-8",
);

describe("NavigationMenu motion", () => {
  it("uses short page-swap travel and asymmetric popup timing", () => {
    expect(navigationMenuSource).toContain("duration-[var(--duration-fast)]");
    expect(navigationMenuSource).toContain("translate-x-(--distance-base)");
    expect(navigationMenuSource).toContain("blur-(--blur-medium)");
    expect(navigationMenuSource).toContain("data-starting-style:scale-(--scale-medium)");
    expect(navigationMenuSource).toContain("data-ending-style:scale-(--scale-tiny)");
    expect(navigationMenuSource).toContain("data-ending-style:duration-[var(--duration-quick)]");
    expect(navigationMenuSource).toContain("motion-reduce:transition-none");
    expect(navigationMenuSource).not.toContain("translate-x-[50%]");
    expect(navigationMenuSource).not.toContain("duration-[0.35s]");
    expect(navigationMenuSource).not.toContain("transition-all");
  });
});
