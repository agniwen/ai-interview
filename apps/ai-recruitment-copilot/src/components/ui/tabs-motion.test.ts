import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./tabs.tsx", import.meta.url), "utf-8");

describe("Tabs motion behavior", () => {
  it("uses Motion shared layout for active indicators and content entrance", () => {
    expect(source).toContain('from "motion/react"');
    expect(source).toContain("MotionConfig");
    expect(source).toContain("layoutRoot");
    expect(source).toContain("layoutId={layoutId}");
    expect(source).toContain("<motion.span");
    expect(source).toContain("<motion.div");
    expect(source).toContain("useReducedMotion");
  });

  it("keeps the animated default indicator visually aligned with the original shadcn tab", () => {
    expect(source).toContain("rounded-md bg-background shadow-sm");
    expect(source).not.toContain("borderRadius: 6");
  });

  it("does not wrap trigger children in a horizontal flex container", () => {
    expect(source).not.toContain(
      'className="relative z-10 inline-flex items-center justify-center gap-1.5"',
    );
  });
});
