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

  it("includes image formats in upload accept metadata", () => {
    expect(supportedResumeDocumentAccept).toContain("image/jpeg");
    expect(supportedResumeDocumentAccept).toContain(".png");
    expect(supportedResumeDocumentLabel).toContain("JPG");
    expect(supportedResumeDocumentLabel).toContain("PNG");
  });
});
