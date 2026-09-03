import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("router candidate detail navigation", () => {
  it("masks the internal overlay route with the canonical detail URL", async () => {
    const routerSource = await readFile(new URL("router.tsx", import.meta.url), "utf-8");

    expect(routerSource).toContain('from: "/w/$slug/studio/resumes/overlay/$recordId"');
    expect(routerSource).toContain('to: "/w/$slug/studio/resumes/$recordId"');
    expect(routerSource).toContain('from: "/w/$slug/studio/resume-pool/overlay/$recordId"');
    expect(routerSource).toContain('to: "/w/$slug/studio/resume-pool/$recordId"');
    expect(routerSource).toContain("unmaskOnReload: true");
    expect(routerSource).toContain(
      "routeMasks: [recruiterResumeOverlayMask, resumePoolOverlayMask]",
    );
  });

  it("only resets the Studio viewport for standalone candidate details", async () => {
    const routerSource = await readFile(new URL("router.tsx", import.meta.url), "utf-8");

    expect(routerSource).toContain(
      "scrollToTopSelectors: [getStudioCandidateDetailScrollToTopElement]",
    );
  });
});
