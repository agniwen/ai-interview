import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rendererRoot = join(import.meta.dirname, "../..");
const readRendererSource = (path: string) => readFileSync(join(rendererRoot, path), "utf-8");

describe("desktop skeleton reveal", () => {
  it("uses the transitions.dev pulse, reveal, reset, and reduced-motion semantics", () => {
    const styles = readRendererSource("assets/main.css");

    expect(styles).toContain("--pulse-dur: 1000ms");
    expect(styles).toContain("--pulse-count: 1");
    expect(styles).toContain("--duration-slow: 400ms");
    expect(styles).toContain("--blur-small: 2px");
    expect(styles).toContain("--reveal-dur: var(--duration-slow)");
    expect(styles).toContain("--reveal-blur: var(--blur-small)");
    expect(styles).toContain("--reveal-ease: var(--ease-in-out)");
    expect(styles).toContain(".t-skel.is-resetting .t-skel-skeleton");
    expect(styles).toContain(
      "animation: t-skel-pulse var(--pulse-dur) ease-in-out var(--pulse-count)",
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.t-skel-skeleton,[\s\S]*\.t-skel-content\s*\{\s*transition: none !important;/,
    );
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.t-skel-skeleton\.is-pulsing > \*\s*\{\s*animation: none !important;/,
    );
  });

  it("reveals the four safe desktop page swaps without early-returning their skeletons", () => {
    const integrations = [
      ["components/features/meeting/meeting-library-page.tsx", "LoadingLibrary"],
      ["components/features/meeting/meeting-detail-page.tsx", "MeetingSessionPageSkeleton"],
      ["components/features/meeting/meeting-more-page.tsx", "MeetingMorePageSkeleton"],
      ["components/features/studio/resumes/resume-detail-page.tsx", "ResumeDetailSkeleton"],
    ] as const;

    for (const [path, skeleton] of integrations) {
      const source = readRendererSource(path);
      expect(source).toContain('import { SkeletonReveal } from "@/components/ui/skeleton-reveal"');
      expect(source).toContain(
        `<SkeletonReveal loading={isInitialLoading} skeleton={<${skeleton} />}>`,
      );
      expect(source).not.toContain(`return <${skeleton} />`);
    }
  });
});
