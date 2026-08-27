import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("recruitment desk detail navigation", () => {
  it("opens the internal overlay without resetting the list scroll position", async () => {
    const [actionsSource, listSource, modelSource] = await Promise.all([
      readFile(new URL("../use-resume-library-page-actions.ts", import.meta.url), "utf-8"),
      readFile(new URL("../resume-library-page-list.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../resume-library-page-model.tsx", import.meta.url), "utf-8"),
    ]);

    expect(actionsSource).toContain('getRouteApi("/w/$slug/studio/resumes/overlay/$recordId")');
    expect(actionsSource).toContain("resetScroll: false");
    expect(actionsSource).toContain("fromRecruiterResumeList: true");
    expect(actionsSource).toContain('to: "/w/$slug/studio/resumes/overlay/$recordId"');
    expect(listSource).not.toContain("setResumeLibraryScrollRestoreSnapshot");
    expect(modelSource).not.toContain("ResumeLibraryScrollRestoreSnapshot");
    expect(modelSource).toContain("useElementScrollRestoration");
  });

  it("fills the content area while keeping the fixed header above the overlay", async () => {
    const [studioRouteSource, overlaySource] = await Promise.all([
      readFile(new URL("../../../../../routes/w.$slug.studio.tsx", import.meta.url), "utf-8"),
      readFile(new URL("../../studio-content-route-overlay.tsx", import.meta.url), "utf-8"),
    ]);

    expect(studioRouteSource).toContain('className="pointer-events-none absolute inset-0 z-10"');
    expect(studioRouteSource).toContain("[&_[data-overlayscrollbars-viewport]]:z-auto!");
    expect(overlaySource).toContain("pt-[calc(var(--header-height)+1rem)]");
  });

  it("shows the same generated candidate avatar in recruiter detail headers", async () => {
    const detailSource = await readFile(
      new URL("../recruiter-resume-detail-page.tsx", import.meta.url),
      "utf-8",
    );

    expect(detailSource).toContain("<Avatar");
    expect(detailSource).toContain("<AvatarFallback>");
    expect(detailSource).toContain("seed={avatarSeed}");
    expect(detailSource).toContain("text-[14px] text-muted-foreground/60");
    expect(detailSource).toContain("formatResumeRecordDisplayId(recordId)");

    const cardSource = await readFile(
      new URL("../resume-library-card.tsx", import.meta.url),
      "utf-8",
    );
    expect(cardSource).toContain("function getCandidateAvatarSeed(candidateName: string)");
    expect(cardSource).toContain('return candidateName.trim() || "未命名候选人";');
    expect(cardSource).toContain("seed={getCandidateAvatarSeed(record.candidateName)}");
  });
});
