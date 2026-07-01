import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourcePath = fileURLToPath(new URL("resume-analysis-overlay.tsx", import.meta.url));
const source = readFileSync(sourcePath, "utf-8");

describe("ResumeAnalysisOverlay", () => {
  it("only renders OCR page progress before resume text extraction finishes", () => {
    expect(source).toContain('tool.name === "提取简历文本" && tool.done');
    expect(source).toContain('tool.name === "提取结构化字段"');
    expect(source).toContain("!hasCompletedResumeTextExtraction");
    expect(source).toContain("!hasStartedStructuringResume");
    expect(source).toContain("shouldShowOcrProgress ? (");
  });

  it("does not render OCR text preview summaries during resume text extraction", () => {
    expect(source).not.toContain("textPreview");
    expect(source).not.toContain("页预览");
  });
});
