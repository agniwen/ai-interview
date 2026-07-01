import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("resume-overview-panel.tsx", import.meta.url), "utf-8");

describe("ResumeOverviewPanel visual density", () => {
  it("matches the airy resume detail pattern without nested bordered cards", () => {
    expect(source).toContain("function SummaryItem");
    expect(source).toContain("<dt");
    expect(source).toContain("<dd");
    expect(source).toContain('className="space-y-8"');
    expect(source).toContain("rounded-2xl border border-muted/60 bg-muted/20 p-5");
    expect(source).toContain("border-t border-border/50 pt-6");
    expect(source).toContain("grid gap-x-8 gap-y-4 md:grid-cols-2");
    expect(source).not.toContain("SoftPanel");
    expect(source).not.toContain("rounded-2xl border border-border bg-background p-5");
  });

  it("keeps AI parsed review out of the overview summary area", () => {
    const overviewBody = source.slice(source.indexOf("export function ResumeOverviewPanel"));

    expect(overviewBody).not.toContain("<ResumeReviewStructuredView");
  });

  it("shows resume evaluation as a read-only summary field", () => {
    const overviewBody = source.slice(source.indexOf("export function ResumeOverviewPanel"));

    expect(overviewBody).toContain("describeResumeEvaluationStatus");
    expect(overviewBody).toContain('<SummaryItem label="简历评估"');
    expect(overviewBody).not.toContain("<Select");
    expect(overviewBody).not.toContain("onValueChange");
  });

  it("does not repeat structured resume fields in the overview summary", () => {
    const overviewBody = source.slice(source.indexOf("export function ResumeOverviewPanel"));

    expect(overviewBody).toContain('<SummaryItem label="关联岗位"');
    expect(overviewBody).toContain('<SummaryItem label="简历评估"');
    expect(overviewBody).not.toContain('<SummaryItem label="目标岗位"');
    expect(overviewBody).not.toContain('<SummaryItem label="工作年限"');
    expect(overviewBody).not.toContain("核心技能");
    expect(overviewBody).not.toContain("主要亮点");
  });

  it("uses a spacious AI review layout instead of dense nested cards", () => {
    const reviewSource = source.slice(
      source.indexOf("export function ResumeReviewStructuredView"),
      source.indexOf("function ExpandableMarkdownSummary"),
    );

    expect(reviewSource).toContain("max-w-5xl space-y-8");
    expect(reviewSource).toContain("ReviewSectionHeader");
    expect(reviewSource).toContain("divide-y divide-border/50");
    expect(reviewSource).not.toContain("grid gap-5 lg:grid-cols-2");
    expect(reviewSource).not.toContain("space-y-1 rounded-lg bg-muted/20 p-4");
  });

  it("adds muted borders to AI review background surfaces", () => {
    const reviewSource = source.slice(
      source.indexOf("export function ResumeReviewStructuredView"),
      source.indexOf("function ExpandableMarkdownSummary"),
    );

    expect(reviewSource).toContain("border border-muted/60 bg-muted/20");
    expect(reviewSource).not.toContain("rounded-2xl bg-muted/20");
  });
});
