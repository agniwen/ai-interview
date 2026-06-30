import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../w.$slug.studio.resumes.tsx", import.meta.url), "utf-8");

describe("ResumeLibraryPage duplicate badges", () => {
  it("opens duplicate match details from resume library badges", () => {
    expect(source).toContain("ResumeDuplicateMatchesDialog");
    expect(source).toContain("fetchStudioResumeDuplicateMatches");
    expect(source).toContain("formatResumeRecordDisplayId(r.id)");
    expect(source).toContain("text-muted-foreground/70 text-[11px]");
    expect(source).toContain("setDuplicateMatchRecord(r)");
    expect(source).toContain("duplicateMatchBadge(r, () => setDuplicateMatchRecord(r))");
  });

  it("shows the masked id under the name without table email text", () => {
    const candidateCellSource = source.slice(
      source.indexOf("const documentKind = getResumeDocumentFileIconKind"),
      source.indexOf('key: "jobDescriptionName"'),
    );

    expect(candidateCellSource).toContain("{r.candidateName}");
    expect(candidateCellSource).toContain("formatResumeRecordDisplayId(r.id)");
    expect(candidateCellSource).toContain("text-muted-foreground/70 text-[11px]");
    expect(candidateCellSource).not.toContain("mailto:");
  });

  it("shows row details in a hover card for the candidate column", () => {
    const candidateCellSource = source.slice(
      source.indexOf("const documentKind = getResumeDocumentFileIconKind"),
      source.indexOf('key: "jobDescriptionName"'),
    );

    expect(candidateCellSource).toContain("<HoverCard");
    expect(candidateCellSource).toContain("<HoverCardTrigger asChild>");
    expect(candidateCellSource).toContain("<HoverCardContent");
    expect(candidateCellSource).toContain("r.candidateEmail");
    expect(candidateCellSource).toContain("r.candidatePhone");
    expect(candidateCellSource).toContain("r.targetRole");
    expect(candidateCellSource).toContain("getResumeLibraryJobDescriptionLabel(r)");
    expect(candidateCellSource).toContain("r.creatorName");
    expect(candidateCellSource).toContain("r.createdAt");
    expect(candidateCellSource).toContain("r.lastInterviewAt");
    expect(candidateCellSource).toContain("describeLifecycleCell(r).fullLabel");
  });
});
