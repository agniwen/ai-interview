import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("studio-person-detail-panel.tsx", import.meta.url), "utf-8");

function sourceBetween(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

describe("StudioPersonDetailPanel visual density", () => {
  it("uses breathable tab spacing for resume and AI interview details", () => {
    expect(source).toContain('"flex flex-col gap-8"');
    expect(source).toContain('"min-w-0 flex flex-col gap-8"');
  });

  it("keeps the AI interview overview free of nested bordered cards", () => {
    const overviewSource = sourceBetween('<TabsContent value="overview">', "{/* 轮次概览");

    expect(overviewSource).toContain("rounded-2xl bg-muted/20 p-5");
    expect(overviewSource).toContain("border-t border-border/50 pt-6");
    expect(overviewSource).not.toContain("rounded-2xl border border-border bg-background p-5");
  });

  it("keeps tab panels lightweight across reports, questions, experience, and rounds", () => {
    const reportsSource = sourceBetween(
      '<TabsContent value="reports">',
      '<TabsContent value="questions">',
    );
    const questionsSource = sourceBetween(
      '<TabsContent value="questions">',
      '<TabsContent value="experience">',
    );
    const experienceSource = sourceBetween(
      '<TabsContent value="experience">',
      '<TabsContent value="rounds">',
    );
    const roundsSource = sourceBetween(
      '<TabsContent value="rounds">',
      '<TabsContent value="human-interview">',
    );

    expect(reportsSource).toContain('<SummaryMetric label="本轮通话次数"');
    expect(reportsSource).toContain("rounded-2xl border border-border/70 bg-muted/25 px-0");
    expect(questionsSource).toContain('className="space-y-4"');
    expect(questionsSource).toContain("rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border");
    expect(experienceSource).not.toContain("rounded-2xl border border-border bg-background p-5");
    expect(roundsSource).toContain('className="space-y-4"');
    expect(roundsSource).toContain("rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border");
    expect(roundsSource).not.toContain("<SoftPanel");
  });

  it("uses a consistent framed surface for expanded interview report items", () => {
    const reportsSource = sourceBetween(
      '<TabsContent value="reports">',
      '<TabsContent value="questions">',
    );

    expect(reportsSource).toContain("rounded-2xl border border-border/70 bg-muted/25 px-0");
    expect(reportsSource).toContain("bg-muted/25 px-5 pt-4 pb-5");
    expect(reportsSource).toContain(
      "rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm",
    );
    expect(reportsSource).toContain(
      "rounded-xl border border-border/60 bg-background p-4 shadow-sm",
    );
  });
});
