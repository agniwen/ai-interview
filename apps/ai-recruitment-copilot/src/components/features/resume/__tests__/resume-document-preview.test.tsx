import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PdfFileIcon } from "@/components/features/pdf/pdf-file-icon";
import * as previewButtonModule from "@/components/features/resume/resume-document-preview-button";

describe("resume document preview", () => {
  it("treats PPTX resumes as previewable documents", () => {
    expect(
      previewButtonModule.getPreviewableResumeDocumentKind({
        fileName: "portfolio.pptx",
        mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    ).toBe("pptx");
  });

  it("derives the PPTX preview PDF URL from the original file URL", () => {
    const helpers = previewButtonModule as typeof previewButtonModule & {
      getPptxPreviewPdfUrl?: (url: string) => string;
    };

    expect(helpers.getPptxPreviewPdfUrl?.("/api/w/acme/studio/resumes/r1/resume")).toBe(
      "/api/w/acme/studio/resumes/r1/resume-preview.pdf",
    );
    expect(
      helpers.getPptxPreviewPdfUrl?.("/api/w/acme/chat/attachments/a1?download=0#page=2"),
    ).toBe("/api/w/acme/chat/attachments/a1-preview.pdf?download=0#page=2");
  });

  it("uses the shared document icon geometry for PDF files", () => {
    const markup = renderToStaticMarkup(<PdfFileIcon className="size-8" />);

    expect(markup).toContain('viewBox="0 0 56 64"');
    expect(markup).toContain('aria-hidden="true"');
  });
});
