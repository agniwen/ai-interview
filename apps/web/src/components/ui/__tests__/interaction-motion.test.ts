import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readComponent(name: string) {
  return readFileSync(new URL(`../${name}.tsx`, import.meta.url), "utf-8");
}

describe("shared interaction motion", () => {
  it("keeps button feedback on the quick motion token", () => {
    const button = readComponent("button");

    expect(button).toContain("duration-[var(--duration-quick)]");
    expect(button).toContain("ease-[var(--ease-smooth-out)]");
    expect(button).toContain("motion-reduce:active:scale-100");
    expect(button).not.toContain("duration-[160ms]");
  });

  it("limits accordion and OTP transitions to visible feedback properties", () => {
    for (const name of ["accordion", "input-otp"]) {
      const source = readComponent(name);

      expect(source).not.toContain("transition-all");
      expect(source).toContain("duration-[var(--duration-quick)]");
      expect(source).toContain("motion-reduce:transition-none");
    }
  });

  it("transitions collapsible height symmetrically when opening and closing", () => {
    const collapsible = readComponent("collapsible");

    expect(collapsible).toContain("h-(--collapsible-panel-height)");
    expect(collapsible).toContain("transition-[height]");
    expect(collapsible).toContain("data-starting-style:h-0");
    expect(collapsible).toContain("data-ending-style:h-0");
    expect(collapsible).toContain("motion-reduce:transition-none");
    expect(collapsible).not.toContain("animate-collapsible-down");
    expect(collapsible).not.toContain("animate-collapsible-up");
  });
});
