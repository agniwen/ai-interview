import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativeUrl: string) {
  return readFileSync(new URL(relativeUrl, import.meta.url), "utf-8");
}

describe("motion polish", () => {
  it("keeps button feedback scoped to explicit properties and press states", () => {
    const source = readSource("./button.tsx");

    expect(source).not.toContain("transition-all");
    expect(source).toContain(
      "transition-[background-color,border-color,color,box-shadow,transform,opacity]",
    );
    expect(source).toContain("duration-[160ms]");
    expect(source).toContain("ease-[cubic-bezier(0.23,1,0.32,1)]");
    expect(source).toContain("active:scale-[0.97]");
    expect(source).not.toContain("hover:scale-[0.95]");
    expect(source).not.toContain("hover:scale-[0.98]");
  });

  it("keeps progress transitions on the transform layer only", () => {
    const source = readSource("./progress.tsx");

    expect(source).not.toContain("transition-all");
    expect(source).toContain(
      "transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
    );
    expect(source).toContain("motion-reduce:transition-none");
  });

  it("keeps upload drag motion fast enough for immediate feedback", () => {
    const source = readSource("./file-upload.tsx");

    expect(source).not.toContain("duration-500");
    expect(source).toContain("duration-[220ms]");
    expect(source).toContain("scale-[1.08]");
    expect(source).not.toContain("scale(1.18)");
    expect(source).not.toContain("scale-[1.14]");
  });

  it("gives text flips reduced-motion handling and snappier defaults", () => {
    const source = readSource("../features/motion/text-flip.tsx");

    expect(source).toContain("useReducedMotion");
    expect(source).toContain("duration: 0.2");
    expect(source).toContain("ease: [0.23, 1, 0.32, 1]");
    expect(source).toContain("initial: { opacity: 0, y: -6 }");
    expect(source).toContain("exit: { opacity: 0, y: 6 }");
  });

  it("keeps animated height under the standard UI timing budget", () => {
    const source = readSource("../features/motion/animated-height.tsx");

    expect(source).toContain("duration = 0.24");
    expect(source).toContain("ease: [0.77, 0, 0.175, 1]");
  });

  it("keeps resume-library document hover feedback subtle", () => {
    const source = readSource("../../routes/w.$slug.studio.resumes.tsx");

    expect(source).not.toContain("group-hover/pdf:scale-105");
    expect(source).toContain("group-hover/pdf:scale-[1.03]");
    expect(source).toContain("motion-reduce:group-hover/pdf:scale-100");
  });
});
