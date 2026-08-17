import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../../../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8");
}

describe("animation motion regressions", () => {
  it("keeps camera tiles physical and reduced-motion aware", () => {
    const tileView = readSource(
      "apps/ai-recruitment-copilot/src/components/agents-ui/blocks/agent-session-view-01/components/tile-view.tsx",
    );

    expect(tileView).toContain("useReducedMotion");
    expect(tileView).toContain("scale: reduceMotion ? 1 : 0.95");
    expect(tileView).not.toContain("scale: 0");
  });

  it("keeps the text shimmer on CSS with a static reduced-motion state", () => {
    const shimmer = readSource(
      "apps/ai-recruitment-copilot/src/components/ai-elements/shimmer.tsx",
    );
    const globalStyles = readSource("apps/ai-recruitment-copilot/src/styles/globals.css");

    expect(shimmer).toContain("ai-text-shimmer");
    expect(shimmer).not.toContain('from "motion/react"');
    expect(globalStyles).toContain("@keyframes text-shimmer");
    expect(globalStyles).toContain(".ai-text-shimmer {\n    animation: none !important;");
  });

  it("animates shared progress through transforms instead of width", () => {
    const progress = readSource("apps/ai-recruitment-copilot/src/components/ui/progress.tsx");

    expect(progress).toMatch(/transform: `scaleX\(\$\{progressScale\}\)`/);
    expect(progress).toContain('width: "100%"');
    expect(progress).not.toContain("transition-all");
  });

  it("preserves the original coordinated desktop sidebar transition", () => {
    const sidebar = readSource("apps/ai-recruitment-copilot/src/components/ui/sidebar.tsx");

    expect(sidebar).toContain("transition-[width] duration-200 ease-linear");
    expect(sidebar).toContain("transition-[left,right,width] duration-200 ease-linear");
    expect(sidebar).toContain("transition-[margin,opacity] duration-200 ease-linear");
    expect(sidebar).toContain("transition-[width,height,padding]");
  });

  it("signals when animated height changes finish", () => {
    const animatedHeight = readSource(
      "apps/ai-recruitment-copilot/src/components/features/motion/animated-height.tsx",
    );

    expect(animatedHeight).toContain('data-slot="animated-height"');
    expect(animatedHeight).toContain("onAnimationComplete");
    expect(animatedHeight).toContain("ANIMATED_HEIGHT_COMPLETE_EVENT");
  });
});
