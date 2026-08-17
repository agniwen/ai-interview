import { describe, expect, it } from "vitest";
import {
  getResumeComparisonDocument,
  getResumeComparisonDocumentKind,
} from "./resume-dedup-compare-model";

describe("Resume dedup comparison document model", () => {
  it.each([
    ["resume.pdf", "pdf"],
    ["resume.docx", "docx"],
    ["resume.xlsx", "xlsx"],
    ["resume.pptx", "pdf"],
    ["resume.png", "image"],
  ] as const)("maps %s to the %s comparison viewer", (fileName, kind) => {
    expect(getResumeComparisonDocumentKind(fileName)).toBe(kind);
  });

  it("uses the permission-free review endpoint for both comparison sources", () => {
    expect(
      getResumeComparisonDocument({
        fileName: "candidate.pdf",
        id: "resume-1",
        slug: "acme",
        sourceType: "studio_interview",
      }),
    ).toEqual({
      downloadUrl: "/api/w/acme/studio/resumes/resume-1/review/resume",
      kind: "pdf",
      previewUrl: "/api/w/acme/studio/resumes/resume-1/review/resume",
    });
    expect(
      getResumeComparisonDocument({
        fileName: "candidate.pdf",
        id: "pool-1",
        slug: "acme",
        sourceType: "resume_pool_item",
      })?.downloadUrl,
    ).toBe("/api/w/acme/studio/resume-pool/pool-1/review/resume");
  });
});
