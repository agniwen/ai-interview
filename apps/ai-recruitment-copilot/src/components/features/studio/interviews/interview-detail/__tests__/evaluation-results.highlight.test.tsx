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

  it("keeps the existing evaluation layout for legacy reports", () => {
    const html = renderToStaticMarkup(
      <EvaluationResults
        data={{
          overallScore: 82,
          questions: [
            {
              assessment: "旧报告评估仍然可见",
              order: 1,
              question: "旧报告题目",
              score: 8,
            },
          ],
        }}
        dataCollectionResults={{}}
      />,
    );

    expect(html).toContain("旧报告评估仍然可见");
    expect(html).toContain("旧报告题目");
    expect(html).not.toContain("考核意图");
  });

  it("fuses V2 question coverage with evaluation evidence", () => {
    const html = renderToStaticMarkup(
      <EvaluationResults
        data={{
          questions: [
            {
              assessment: "回答覆盖了完整排障链路",
              evidence: [{ quote: "我先看告警，再定位根因", turnIndex: 2 }],
              order: 1,
              question: "请介绍故障排查经历",
              questionId: "question-1",
              score: 8,
            },
          ],
        }}
        dataCollectionResults={{
          questions: [
            {
              answerSummary: "说明了告警、根因和预防措施",
              difficulty: "medium",
              endedAtSecs: 48,
              evaluationFocus: "确认候选人能够定位并复盘线上故障",
              followUpCount: 1,
              followUpDirections: "追问定位信号、根因和预防措施",
              question: "请介绍故障排查经历",
              questionId: "question-1",
              reason: null,
              revision: 1,
              startedAtSecs: 12,
              status: "answered",
            },
          ],
          schemaVersion: 2,
        }}
      />,
    );

    expect(html).toContain("已回答");
    expect(html).toContain("考核意图");
    expect(html).toContain("确认候选人能够定位并复盘线上故障");
    expect(html).toContain("追问 1 次");
    expect(html).toContain("用时 36 秒");
    expect(html).toContain("回答覆盖了完整排障链路");
  });

  it("still shows V2 question coverage when evaluation generation failed", () => {
    const html = renderToStaticMarkup(
      <EvaluationResults
        data={{}}
        dataCollectionResults={{
          questions: [
            {
              answerSummary: null,
              difficulty: "easy",
              endedAtSecs: 20,
              evaluationFocus: null,
              followUpCount: 0,
              followUpDirections: null,
              question: "尚未生成评估的题目",
              questionId: "question-1",
              reason: "time_limit",
              revision: 1,
              startedAtSecs: 10,
              status: "interrupted",
            },
          ],
          schemaVersion: 2,
        }}
      />,
    );

    expect(html).toContain("尚未生成评估的题目");
    expect(html).toContain("已中断");
    expect(html).toContain("不评分");
  });
});
