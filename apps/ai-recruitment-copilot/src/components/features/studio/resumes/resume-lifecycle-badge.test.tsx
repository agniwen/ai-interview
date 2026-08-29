import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeLifecycleBadge } from "./resume-lifecycle-badge";

describe("ResumeLifecycleBadge", () => {
  it("uses the active brand palette for informational lifecycle stages", () => {
    const markup = renderToStaticMarkup(
      <ResumeLifecycleBadge
        detailLabel="1/1 待进场"
        fullLabel="AI 面试 · 1/1 待进场"
        stageLabel="AI 面试"
        tone="info"
      />,
    );

    expect(markup).toContain("border-primary/25");
    expect(markup).toContain("bg-primary/10");
    expect(markup).toContain("text-primary");
    expect(markup).toContain("dark:text-chart-4");
    expect(markup).toContain("hover:ring-primary/10");
    expect(markup).not.toContain("sky-");
  });

  it("keeps the human interview stage blue regardless of progress tone", () => {
    const markup = renderToStaticMarkup(
      <ResumeLifecycleBadge
        detailLabel="1/1 通过待决策"
        fullLabel="真人复面 · 1/1 通过待决策"
        stage="human_interview"
        stageLabel="真人复面"
        tone="success"
      />,
    );

    expect(markup).toContain("border-sky-500/30");
    expect(markup).toContain("bg-sky-500/10");
    expect(markup).toContain("text-sky-700");
    expect(markup).toContain("hover:ring-sky-500/10");
    expect(markup).not.toContain("emerald-");
  });

  it("keeps the Offer stage pink regardless of progress tone", () => {
    const markup = renderToStaticMarkup(
      <ResumeLifecycleBadge
        detailLabel="待发出"
        fullLabel="Offer · 待发出"
        stage="offer"
        stageLabel="Offer"
        tone="outline"
      />,
    );

    expect(markup).toContain("border-pink-500/30");
    expect(markup).toContain("bg-pink-500/10");
    expect(markup).toContain("text-pink-700");
    expect(markup).toContain("hover:ring-pink-500/10");
    expect(markup).not.toContain("border-border");
  });
});
