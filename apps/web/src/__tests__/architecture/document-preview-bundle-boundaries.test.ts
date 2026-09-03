import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf-8");

describe("document preview bundle boundaries", () => {
  it("keeps the PDF dialog shell synchronous and lazy-loads only the viewer", () => {
    const button = readSource("components/features/pdf/pdf-preview-button.tsx");
    const dialog = readSource("components/features/pdf/pdf-preview-dialog.tsx");

    expect(button).toContain(
      'import { PdfPreviewDialog } from "@/components/features/pdf/pdf-preview-dialog"',
    );
    expect(button).not.toContain("lazy(");
    expect(dialog).toContain("const PDFViewer = lazy(loadPdfViewer)");
    expect(dialog).toContain("<Modal");
    expect(dialog).toContain("<Suspense fallback={<PdfViewerLoading />}");
  });

  it("keeps the shared document dialog synchronous and office viewers lazy", () => {
    const dialog = readSource("components/features/resume/resume-document-preview-dialog.tsx");
    const callsites = [
      "components/features/resume/resume-document-preview-button.tsx",
      "components/features/resume/resume-document-preview-modal.tsx",
      "components/features/studio/upload-task-inbox.tsx",
      "components/features/studio/interviews/interview-management-page.tsx",
      "components/assistant-ui/recruiting-copilot-context.tsx",
    ].map(readSource);

    expect(dialog).toContain("const DocxViewerPreview = lazy(");
    expect(dialog).toContain("const XlsxViewerPreview = lazy(");
    expect(dialog).toContain("<ResumeDocumentViewerLoading kind={kind} />");
    for (const source of callsites) {
      expect(source).not.toContain(
        'await import("@/components/features/resume/resume-document-preview-dialog")',
      );
    }
  });

  it("opens duplicate-comparison modal before loading its heavy content", () => {
    const overlay = readSource("components/features/resume/resume-dedup-overlay.tsx");
    const shell = readSource("components/features/resume/resume-dedup-compare-dialog-shell.tsx");

    expect(overlay).toContain('from "./resume-dedup-compare-dialog-shell"');
    expect(overlay).not.toContain("<Suspense fallback={null}>");
    expect(shell).toContain("<Modal");
    expect(shell).toContain('await import("./resume-dedup-compare-dialog")');
    expect(shell).toContain("正在加载简历对比…");
  });

  it("keeps candidate-detail modal shells synchronous", () => {
    const copilotContext = readSource("components/assistant-ui/recruiting-copilot-context.tsx");
    const poolDialogs = readSource(
      "components/features/studio/resume-pool/resume-pool-dialogs.tsx",
    );
    const poolDetailShell = readSource(
      "components/features/studio/resume-pool/resume-pool-detail-dialog-shell.tsx",
    );

    expect(copilotContext).not.toContain("const ResumePoolDetailDialog = lazy(");
    expect(poolDialogs).not.toContain("const StudioPersonDetailDialog = lazy(");
    expect(poolDetailShell).toContain("<Modal");
    expect(poolDetailShell).toContain('await import("./resume-pool-details")');
  });
});
