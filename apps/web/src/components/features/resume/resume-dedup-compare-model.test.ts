import { describe, expect, it } from "vitest";
import {
  getResumeComparisonDocument,
  getResumeComparisonDocumentKind,
} from "./resume-dedup-compare-model";

describe("resume dedup comparison model", () => {
  it("maps recruitment and talent-pool records to their original resume resources", () => {
    expect(
      getResumeComparisonDocument({
        fileName: "candidate.docx",
        id: "resume-1",
        slug: "acme",
        sourceType: "studio_interview",
      }),
    ).toEqual({
      downloadUrl: "/api/w/acme/studio/resumes/resume-1/review/resume",
      kind: "docx",
      previewUrl: "/api/w/acme/studio/resumes/resume-1/review/resume",
    });
    expect(
      getResumeComparisonDocument({
        fileName: "candidate.pdf",
        id: "pool-1",
        slug: "acme",
        sourceType: "resume_pool_item",
      }),
    ).toEqual({
      downloadUrl: "/api/w/acme/studio/resume-pool/pool-1/review/resume",
      kind: "pdf",
      previewUrl: "/api/w/acme/studio/resume-pool/pool-1/review/resume",
    });
  });

  it("uses the converted PDF endpoint for PPTX while preserving the original download", () => {
    expect(
      getResumeComparisonDocument({
        fileName: "portfolio.pptx",
        id: "resume-2",
        slug: "acme",
        sourceType: "studio_interview",
      }),
    ).toEqual({
      downloadUrl: "/api/w/acme/studio/resumes/resume-2/review/resume",
      kind: "pdf",
      previewUrl: "/api/w/acme/studio/resumes/resume-2/review/resume-preview.pdf",
    });
  });

  it("rejects legacy formats that the side-by-side viewer cannot render", () => {
    expect(getResumeComparisonDocumentKind("legacy.doc")).toBeNull();
    expect(getResumeComparisonDocumentKind("legacy.xls")).toBeNull();
    expect(getResumeComparisonDocumentKind("legacy.ppt")).toBeNull();
    expect(getResumeComparisonDocumentKind("resume.html")).toBeNull();
  });
});
