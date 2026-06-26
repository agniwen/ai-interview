import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = path.resolve(import.meta.dirname, "../..");

function readSource(relativePath: string) {
  return readFileSync(path.join(srcRoot, relativePath), "utf-8");
}

describe("TanStack Start shared component migration", () => {
  it("keeps shared components used by Start routes free of Next runtime imports", () => {
    const sources = [
      readSource("components/features/pdf/pdf-preview-button.tsx"),
      readSource("components/features/resume-import/resume-import-button.tsx"),
      readSource("components/features/candidate/candidate-basic-info-view.tsx"),
      readSource("components/features/studio/studio-switch-account-button.tsx"),
    ];

    expect(sources.join("\n")).not.toMatch(
      /next\/(?:dynamic|navigation|headers|server|cache|link)/u,
    );
  });

  it("keeps PDF preview lazy loading failures scoped to the preview button", () => {
    const previewButtonSource = readSource("components/features/pdf/pdf-preview-button.tsx");

    expect(previewButtonSource).toContain('import("@/components/features/pdf/pdf-preview-dialog")');
    expect(previewButtonSource).toContain("isDynamicImportFetchError");
    expect(previewButtonSource).toContain("String(error)");
    expect(previewButtonSource).toContain("pdf-preview-dialog.tsx?retry=");
    expect(previewButtonSource).toContain("PdfPreviewErrorBoundary");
    expect(previewButtonSource).toContain("PdfPreviewFallbackDialog");
    expect(previewButtonSource).toContain("<iframe");
    expect(previewButtonSource).not.toContain('toast.error("简历预览加载失败，请刷新后重试")');
  });
});
