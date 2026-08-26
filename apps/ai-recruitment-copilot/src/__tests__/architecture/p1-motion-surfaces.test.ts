import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(import.meta.dirname, "../..");
const readSource = (path: string) => readFileSync(join(srcRoot, path), "utf-8");

describe("Web P1 motion surfaces", () => {
  it("uses asymmetric panel timing without animating the initial sidebar mount", () => {
    const sidebar = readSource("components/ui/document-viewer-sidebar.tsx");

    expect(sidebar).toContain("transitionsReady");
    expect(sidebar).toContain("duration-[var(--duration-slow)]");
    expect(sidebar).toContain("duration-[var(--duration-medium)]");
    expect(sidebar).toContain("ease-[var(--ease-smooth-out)]");
    expect(sidebar).toContain("motion-reduce:transition-none");
    expect(sidebar).not.toContain("shouldAnimateSidebar");
    expect(sidebar).not.toContain("duration-200 ease-out");
  });

  it("reveals loaded thumbnails with the skeleton reveal tokens", () => {
    const thumbnail = readSource("components/ui/file-thumbnail.tsx");

    expect(thumbnail.match(/duration-\[var\(--duration-slow\)\]/g)).toHaveLength(2);
    expect(thumbnail.match(/ease-\[var\(--ease-in-out\)\]/g)).toHaveLength(2);
    expect(thumbnail.match(/blur-\(--blur-small\)/g)).toHaveLength(2);
    expect(thumbnail.match(/motion-reduce:transition-none/g)).toHaveLength(2);
    expect(thumbnail).not.toContain("duration-[160ms]");
    expect(thumbnail).not.toContain("opacity-0 blur-sm");
  });

  it("keeps upload feedback on the fast smooth-out interaction token", () => {
    const upload = readSource("components/ui/file-upload.tsx");

    expect(upload.match(/duration-\[var\(--duration-fast\)\]/g)).toHaveLength(3);
    expect(upload.match(/ease-\[var\(--ease-smooth-out\)\]/g)).toHaveLength(3);
    expect(upload.match(/motion-reduce:transition-none/g)).toHaveLength(3);
    expect(upload).not.toContain("duration-[220ms]");
    expect(upload).not.toContain("duration-200 ease-out");
  });

  it("uses the process-tab distance and blur scale with a static reduced-motion path", () => {
    const processTabs = readSource("components/features/home/process-tabs.tsx");

    expect(processTabs).toContain('{ filter: "blur(3px)", opacity: 0, y: -8 }');
    expect(processTabs).toContain('{ filter: "blur(3px)", opacity: 0, y: 8 }');
    expect(processTabs).toContain("{ duration: 0 }");
    expect(processTabs).toContain("{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }");
    expect(processTabs).toContain("duration-[var(--duration-fast)]");
    expect(processTabs).toContain("ease-[var(--ease-smooth-out)]");
    expect(processTabs).toContain("motion-reduce:transition-none");
    expect(processTabs).not.toContain('filter: "blur(5px)"');
    expect(processTabs).not.toContain("duration: 0.32");
  });

  it("uses fast smooth-out motion for landing cards and carousel indicators", () => {
    for (const path of [
      "components/features/home/capability-grid.tsx",
      "components/features/home/personas.tsx",
      "components/features/home/testimonials.tsx",
    ]) {
      const source = readSource(path);

      expect(source).toContain("duration-[var(--duration-fast)]");
      expect(source).toContain("ease-[var(--ease-smooth-out)]");
      expect(source).toContain("motion-reduce:transition-none");
      expect(source).not.toContain("duration-[240ms]");
    }

    const carousel = readSource("components/features/home/center-carousel.tsx");
    expect(carousel).toContain("transition-[width,background-color]");
    expect(carousel).toContain("duration-[var(--duration-fast)]");
    expect(carousel).toContain("ease-[var(--ease-smooth-out)]");
    expect(carousel).toContain("motion-reduce:transition-none");
    expect(carousel).not.toContain("transition-all duration-300");
  });
});
