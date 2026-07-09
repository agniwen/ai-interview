import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EvaluationResults } from "../evaluation-results";

describe("EvaluationResults highlighting", () => {
  it("highlights keywords in question assessment", () => {
    const html = renderToStaticMarkup(
      <EvaluationResults
        data={{
          questions: [
            { assessment: "候选人负责项目管理，绩效提升30%", order: 1, question: "介绍项目" },
          ],
        }}
      />,
    );
    expect(html).toContain('data-category="skill"');
    expect(html).toContain('data-category="metric"');
  });

  it("highlights keywords in overallAssessment", () => {
    const html = renderToStaticMarkup(
      <EvaluationResults
        data={{ overallAssessment: "整体擅长数据分析，带10人团队", questions: [] }}
      />,
    );
    expect(html).toContain('data-category="skill"');
    expect(html).toContain('data-category="metric"');
  });

  it("highlights keywords in evidence quote", () => {
    const html = renderToStaticMarkup(
      <EvaluationResults
        data={{
          questions: [
            {
              evidence: [{ quote: "我主导了架构设计", turnIndex: 2 }],
              order: 1,
              question: "项目经历",
            },
          ],
        }}
      />,
    );
    expect(html).toContain('data-category="skill"');
  });
});
