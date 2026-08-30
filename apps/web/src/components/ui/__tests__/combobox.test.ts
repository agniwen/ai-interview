import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const comboboxSource = readFileSync(new URL("../combobox.tsx", import.meta.url), "utf-8");
const cossStyleSource = readFileSync(new URL("../coss-style.ts", import.meta.url), "utf-8");

describe("ComboboxContent", () => {
  it("uses Base UI lifecycle states for its opening and closing transition", () => {
    expect(comboboxSource).toContain("cossAnchoredPopupMotionClass");
    expect(cossStyleSource).toContain("transition-[scale,opacity]");
    expect(cossStyleSource).toContain("duration-[var(--duration-fast)]");
    expect(cossStyleSource).toContain("ease-[var(--ease-smooth-out)]");
    expect(cossStyleSource).toContain("data-starting-style:opacity-0");
    expect(cossStyleSource).toContain("data-starting-style:scale-(--scale-medium)");
    expect(cossStyleSource).toContain("data-ending-style:opacity-0");
    expect(cossStyleSource).toContain("data-ending-style:scale-(--scale-tiny)");
    expect(cossStyleSource).toContain("data-ending-style:duration-[var(--duration-quick)]");
    expect(cossStyleSource).toContain("motion-reduce:transition-none");
    expect(comboboxSource).not.toContain("data-open:animate-in");
    expect(comboboxSource).not.toContain("data-closed:animate-out");
  });
});
