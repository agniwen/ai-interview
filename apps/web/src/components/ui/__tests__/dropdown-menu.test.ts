import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dropdownMenuSource = readFileSync(new URL("../dropdown-menu.tsx", import.meta.url), "utf-8");
const cossStyleSource = readFileSync(new URL("../coss-style.ts", import.meta.url), "utf-8");

describe("DropdownMenuContent", () => {
  it("uses Base UI's ending-style state so a menu remains mounted for its exit animation", () => {
    expect(dropdownMenuSource).toContain("cossAnchoredPopupMotionClass");
    expect(cossStyleSource).toContain("data-starting-style:scale-(--scale-medium)");
    expect(cossStyleSource).toContain("data-ending-style:scale-(--scale-tiny)");
    expect(cossStyleSource).toContain("data-ending-style:duration-[var(--duration-quick)]");
    expect(cossStyleSource).toContain("data-starting-style:opacity-0");
    expect(cossStyleSource).toContain("data-ending-style:opacity-0");
  });
});
