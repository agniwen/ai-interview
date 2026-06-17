import { describe, expect, it } from "vitest";
import {
  getResumeDocumentExtension,
  getResumeDocumentKind,
  isSupportedResumeDocumentInput,
  supportedResumeDocumentAccept,
  supportedResumeDocumentLabel,
} from "../resume-documents";

describe("resume document formats", () => {
  it("accepts common image resume formats as one-file resumes", () => {
    expect(getResumeDocumentKind({ fileName: "resume.jpg" })).toBe("image");
    expect(getResumeDocumentKind({ fileName: "resume.jpeg" })).toBe("image");
    expect(getResumeDocumentKind({ fileName: "resume.png" })).toBe("image");
    expect(getResumeDocumentKind({ mediaType: "image/jpeg" })).toBe("image");
    expect(getResumeDocumentKind({ mediaType: "image/png" })).toBe("image");
    expect(isSupportedResumeDocumentInput({ fileName: "candidate.JPG" })).toBe(true);
  });

  it("uses the actual image extension for storage keys", () => {
    expect(getResumeDocumentExtension({ fileName: "resume.jpeg", mediaType: "image/jpeg" })).toBe(
      "jpeg",
    );
    expect(getResumeDocumentExtension({ mediaType: "image/jpeg" })).toBe("jpg");
    expect(getResumeDocumentExtension({ mediaType: "image/png" })).toBe("png");
    expect(getResumeDocumentExtension({ fileName: "resume.bin", mediaType: "image/png" })).toBe(
      "png",
    );
  });

  it("prefers supported filename extensions over ambiguous Office media types", () => {
    expect(
      getResumeDocumentKind({ fileName: "resume.docx", mediaType: "application/msword" }),
    ).toBe("docx");
    expect(
      getResumeDocumentKind({
        fileName: "resume.xlsx",
        mediaType: "application/vnd.ms-excel",
      }),
    ).toBe("xlsx");
  });

  it("includes image formats in upload accept metadata", () => {
    expect(supportedResumeDocumentAccept).toContain("image/jpeg");
    expect(supportedResumeDocumentAccept).toContain(".png");
    expect(supportedResumeDocumentLabel).toContain("JPG");
    expect(supportedResumeDocumentLabel).toContain("PNG");
  });

  it("accepts legacy Office resume formats", () => {
    expect(getResumeDocumentKind({ fileName: "resume.doc" })).toBe("doc");
    expect(getResumeDocumentKind({ fileName: "resume.ppt" })).toBe("ppt");
    expect(getResumeDocumentKind({ fileName: "resume.xls" })).toBe("xls");
    expect(getResumeDocumentKind({ mediaType: "application/msword" })).toBe("doc");
    expect(getResumeDocumentKind({ mediaType: "application/vnd.ms-powerpoint" })).toBe("ppt");
    expect(getResumeDocumentKind({ mediaType: "application/vnd.ms-excel" })).toBe("xls");
    expect(isSupportedResumeDocumentInput({ fileName: "candidate.XLS" })).toBe(true);
  });

  it("includes legacy Office formats in upload accept metadata", () => {
    expect(supportedResumeDocumentAccept).toContain("application/msword");
    expect(supportedResumeDocumentAccept).toContain("application/vnd.ms-powerpoint");
    expect(supportedResumeDocumentAccept).toContain("application/vnd.ms-excel");
    expect(supportedResumeDocumentAccept).toContain(".doc");
    expect(supportedResumeDocumentAccept).toContain(".ppt");
    expect(supportedResumeDocumentAccept).toContain(".xls");
    expect(supportedResumeDocumentLabel).toContain("DOC");
    expect(supportedResumeDocumentLabel).toContain("PPT");
    expect(supportedResumeDocumentLabel).toContain("XLS");
  });
});
