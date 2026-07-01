import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../w.$slug.studio.resumes.tsx", import.meta.url), "utf-8");

describe("ResumeLibraryPage duplicate badges", () => {
  it("opens duplicate match details from resume library badges", () => {
    expect(source).toContain("ResumeDuplicateMatchesDialog");
    expect(source).toContain("fetchStudioResumeDuplicateMatches");
    expect(source).toContain("formatResumeRecordDisplayId(record.id)");
    expect(source).toContain("onShowDuplicateMatches={setDuplicateMatchRecord}");
    expect(source).toContain("duplicateMatchBadge(record");
    expect(source).toContain("onShowDuplicateMatches(record)");
  });

  it("shows the masked id inside the card resume preview area", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumeLibraryCard("),
      source.indexOf("function ResumeLibraryCardList("),
    );

    expect(cardSource).toContain("{record.candidateName}");
    expect(cardSource).toContain("formatResumeRecordDisplayId(record.id)");
    expect(cardSource).not.toContain("mailto:");
  });

  it("shows row details directly in the candidate card", () => {
    const cardSource = source.slice(
      source.indexOf("function ResumeLibraryCard("),
      source.indexOf("function ResumeLibraryCardList("),
    );

    expect(cardSource).toContain("record.candidateEmail");
    expect(cardSource).toContain("record.candidatePhone");
    expect(cardSource).toContain("record.targetRole");
    expect(cardSource).toContain("getResumeLibraryJobDescriptionLabel(record)");
    expect(cardSource).toContain("record.creatorName");
    expect(cardSource).toContain("record.createdAt");
    expect(cardSource).toContain("record.lastInterviewAt");
    expect(cardSource).toContain("lifecycle.fullLabel");
  });
});
