import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeLifecycleBadge } from "./resume-lifecycle-badge";

describe("ResumeLifecycleBadge", () => {
  it("uses the Klein-blue theme palette for informational lifecycle stages", () => {
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
});
