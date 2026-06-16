// @vitest-environment jsdom

import type React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PdfFileIcon } from "@/components/features/pdf/pdf-file-icon";
import { ResumeDocumentFileIcon } from "@/components/features/resume/resume-document-file-icon";
import * as previewDialogModule from "@/components/features/resume/resume-document-preview-dialog";
import * as previewButtonModule from "@/components/features/resume/resume-document-preview-button";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function stubDesktopViewport() {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: "(max-width: 767px)",
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
}

const viewerMocks = vi.hoisted(() => ({
  docx: vi.fn(() => null),
  pdf: vi.fn(() => null),
  xlsx: vi.fn(() => null),
}));

vi.mock("@/components/features/pdf/pdf-preview-dialog", () => ({
  PdfPreviewDialog: viewerMocks.pdf,
}));

vi.mock("@/components/ui/docx-viewer", () => ({
  DocxViewerPreview: viewerMocks.docx,
}));

vi.mock("@/components/ui/xlsx-viewer", () => ({
  XlsxViewerPreview: viewerMocks.xlsx,
}));

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("resume document preview", () => {
  it("treats PPTX resumes as previewable documents", () => {
    expect(
      previewButtonModule.getPreviewableResumeDocumentKind({
        fileName: "portfolio.pptx",
        mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      }),
    ).toBe("pptx");
  });

  it("treats image resumes as previewable documents", () => {
    expect(
      previewButtonModule.getPreviewableResumeDocumentKind({
        fileName: "resume.png",
        mediaType: "image/png",
      }),
    ).toBe("image");
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

  it("uses the provided SVG Repo image document icon for image resumes", () => {
    const markup = renderToStaticMarkup(<ResumeDocumentFileIcon kind="image" />);

    expect(markup).toContain('viewBox="-4 0 64 64"');
    expect(markup).toContain('fill="#49C9A7"');
    expect(markup).toContain("v-20.904h20.906v20.904");
  });

  it("renders image resume previews with a loading state before the image blob is ready", () => {
    const { ImageResumePreviewContent } = previewDialogModule as typeof previewDialogModule & {
      ImageResumePreviewContent?: (props: { filename?: string; url: string }) => React.ReactNode;
    };
    if (!ImageResumePreviewContent) {
      throw new Error("ImageResumePreviewContent is not exported");
    }

    const markup = renderToStaticMarkup(
      <ImageResumePreviewContent
        filename="resume.jpeg"
        url="/api/w/new/studio/resume-pool/r1/resume"
      />,
    );

    expect(markup).toContain("图片加载中");
    expect(markup).not.toContain("/api/w/new/studio/resume-pool/r1/resume");
  });

  it("fetches image resume previews as blob URLs", async () => {
    const { ImageResumePreviewContent } = previewDialogModule as typeof previewDialogModule & {
      ImageResumePreviewContent?: (props: { filename?: string; url: string }) => React.ReactNode;
    };
    if (!ImageResumePreviewContent) {
      throw new Error("ImageResumePreviewContent is not exported");
    }

    const blob = new Blob(["jpeg"], { type: "image/jpeg" });
    const blobUrl = "blob:http://localhost/resume-preview";
    const fetchMock = vi.fn().mockResolvedValue({
      blob: vi.fn().mockResolvedValue(blob),
      ok: true,
      status: 200,
    });
    const createObjectURL = vi.fn(() => blobUrl);
    const revokeObjectURL = vi.fn();

    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <ImageResumePreviewContent
          filename="resume.jpeg"
          url="/api/w/new/studio/resume-pool/r1/resume"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/w/new/studio/resume-pool/r1/resume",
      expect.objectContaining({ credentials: "include" }),
    );
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    const image = host.querySelector("img");
    expect(image?.getAttribute("alt")).toBe("resume.jpeg");
    expect(image?.getAttribute("src")).toBe(blobUrl);
    expect(host.innerHTML).not.toContain("/api/w/new/studio/resume-pool/r1/resume");

    act(() => {
      root.unmount();
    });

    expect(revokeObjectURL).toHaveBeenCalledWith(blobUrl);
  });

  it("renders the download action in the preview dialog header for image resumes", () => {
    stubDesktopViewport();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    );
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <previewDialogModule.ResumeDocumentPreviewDialog
          filename="resume.jpeg"
          kind="image"
          onOpenChange={() => {}}
          open
          url="/api/w/new/studio/resume-pool/r1/resume"
        />,
      );
    });

    const download = document.querySelector<HTMLAnchorElement>('a[aria-label="下载原文件"]');
    expect(download?.textContent).toContain("下载");
    expect(download?.getAttribute("download")).toBe("resume.jpeg");
    expect(download?.getAttribute("href")).toBe("/api/w/new/studio/resume-pool/r1/resume");

    act(() => {
      root.unmount();
    });
  });

  it("keeps DOCX and XLSX viewer download actions out of resume preview modals", () => {
    stubDesktopViewport();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <previewDialogModule.ResumeDocumentPreviewDialog
          filename="resume.docx"
          kind="docx"
          onOpenChange={() => {}}
          open
          url="/api/w/new/studio/resume-pool/r1/resume"
        />,
      );
    });
    act(() => {
      root.render(
        <previewDialogModule.ResumeDocumentPreviewDialog
          filename="resume.xlsx"
          kind="xlsx"
          onOpenChange={() => {}}
          open
          url="/api/w/new/studio/resume-pool/r2/resume"
        />,
      );
    });

    expect(viewerMocks.docx).toHaveBeenCalledWith(
      expect.objectContaining({ showDownload: false }),
      undefined,
    );
    expect(viewerMocks.xlsx).toHaveBeenCalledWith(
      expect.objectContaining({ showDownload: false }),
      undefined,
    );

    act(() => {
      root.unmount();
    });
  });

  it("passes the original PPTX URL to the outer download action", async () => {
    stubDesktopViewport();
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        <previewDialogModule.ResumeDocumentPreviewDialog
          filename="resume.pptx"
          kind="pptx"
          onOpenChange={() => {}}
          open
          url="/api/w/new/studio/resume-pool/r3/resume"
        />,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(viewerMocks.pdf).toHaveBeenCalledWith(
      expect.objectContaining({
        downloadFileName: "resume.pptx",
        downloadUrl: "/api/w/new/studio/resume-pool/r3/resume",
        url: "/api/w/new/studio/resume-pool/r3/resume-preview.pdf",
      }),
      undefined,
    );

    act(() => {
      root.unmount();
    });
  });
});
