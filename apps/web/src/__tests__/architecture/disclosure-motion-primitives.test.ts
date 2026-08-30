import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(import.meta.dirname, "../..");
const readSource = (path: string) => readFileSync(join(srcRoot, path), "utf-8");

describe("web disclosure motion primitives", () => {
  it("keeps accordion panels mounted and expands them with a two-layer grid", () => {
    const accordion = readSource("components/ui/accordion.tsx");

    expect(accordion).toContain("keepMounted");
    expect(accordion).toContain("grid-rows-[1fr]");
    expect(accordion).toContain("data-starting-style:grid-rows-[0fr]");
    expect(accordion).toContain("data-ending-style:grid-rows-[0fr]");
    expect(accordion).toContain("min-h-0 overflow-hidden");
    expect(accordion).toContain("transition-[grid-template-rows,opacity,filter]");
    expect(accordion).not.toContain("animate-accordion-down");
    expect(accordion).not.toContain("animate-accordion-up");
  });

  it("animates collapsible height with the Base UI measurement", () => {
    const collapsible = readSource("components/ui/collapsible.tsx");

    expect(collapsible).toContain("h-(--collapsible-panel-height)");
    expect(collapsible).toContain("transition-[height]");
    expect(collapsible).toContain("duration-[var(--duration-fast)]");
    expect(collapsible).toContain("ease-[var(--ease-smooth-out)]");
    expect(collapsible).toContain("data-starting-style:h-0");
    expect(collapsible).toContain("data-ending-style:h-0");
    expect(collapsible).toContain("motion-reduce:transition-none");
  });

  it("flips static chevron paths from the trigger state without Motion path morphing", () => {
    const chevrons = readSource("components/icons/chevrons-up-down-icon.tsx");

    expect(chevrons).toContain("[transform-box:fill-box]");
    expect(chevrons).toContain("in-data-[panel-open]:-scale-y-100");
    expect(chevrons).toContain("duration-[var(--duration-fast)]");
    expect(chevrons).toContain("ease-[var(--ease-smooth-out)]");
    expect(chevrons).toContain("motion-reduce:transition-none");
    expect(chevrons).not.toContain("motion/react");

    const workExperience = readSource("components/features/resume/work-experience.tsx");
    expect(workExperience).toContain("<ChevronsUpDownIcon />");
    expect(workExperience).not.toContain("ChevronsUpDownIconHandle");
    expect(workExperience).not.toContain("onOpenChange");
  });
});
