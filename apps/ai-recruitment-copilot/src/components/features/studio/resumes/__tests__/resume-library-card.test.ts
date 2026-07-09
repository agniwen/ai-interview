import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../resume-library-card.tsx", import.meta.url), "utf-8");

describe("ResumeLibraryCard", () => {
  it("uses the shared control surface material without a table frame", () => {
    expect(source).toContain("export const ResumeLibraryCard = memo(");
    expect(source).toContain("border border-input bg-background bg-clip-padding");
    expect(source).toContain("shadow-xs/5");
    expect(source).toContain("before:shadow-[0_1px_--theme(--color-black/4%)]");
    expect(source).toContain("dark:before:shadow-[0_-1px_--theme(--color-white/6%)]");
    expect(source).not.toContain("bg-muted p-1");
  });

  it("puts a resume file preview action before the detail action", () => {
    const actionsSource = source.slice(
      source.indexOf("function ResumeLibraryCardActions("),
      source.indexOf("function ResumeLibraryCardComponent("),
    );

    expect(actionsSource).toContain("ResumeLibraryPreviewAction");
    expect(source).toContain("getResumeDocumentFileIconKind");
    expect(source).toContain("record.hasResumeFile && previewable");
    expect(source).toContain("UnsupportedResumeDocumentPreviewTooltip");
    expect(actionsSource.indexOf("<ResumeLibraryPreviewAction")).toBeLessThan(
      actionsSource.indexOf('label="查看"'),
    );
  });

  it("keeps the left selection strip from opening the detail view", () => {
    expect(source).toContain("const toggleSelected = () => onSelectChange(!selected);");
    expect(source).toContain('className="absolute inset-y-0 left-0 z-10 w-12');
    expect(source).toContain('data-resume-card-interactive="true"');
    expect(source).toContain("event.stopPropagation();");
    expect(source).toContain("onCheckedChange={(value) => onSelectChange(Boolean(value))}");
  });
});
