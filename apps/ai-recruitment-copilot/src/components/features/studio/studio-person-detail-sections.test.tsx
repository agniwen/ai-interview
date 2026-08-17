import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StudioInterviewConversationReport } from "@arc/db-schema/interview-session";
import { CollectedCandidateInfoList, getReportFormItems } from "./studio-person-detail-sections";

describe("CollectedCandidateInfoList", () => {
  it("emphasizes the candidate answer before the AI analysis for communication questions", () => {
    const html = renderToStaticMarkup(
      <CollectedCandidateInfoList
        emptyLabel="暂无沟通题"
        items={[
          {
            analysis: "AI 辅助分析",
            answers: ["候选人主要回答"],
            id: "communication-1",
            kind: "interview",
            question: "请介绍项目经验",
            sequence: 1,
          },
        ]}
      />,
    );

    expect(html.indexOf("候选人主要回答")).toBeLessThan(html.indexOf("AI 辅助分析"));
    expect(html).toContain("font-medium text-foreground leading-6");
    expect(html).toContain("text-muted-foreground text-xs leading-5");
  });
});

describe("getReportFormItems", () => {
  it("uses the form answers frozen with the selected interview report", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const report = {
      snapshotMetadata: {
        fullTextInput: {
          formSubmissions: [
            {
              answers: [
                {
                  label: "期望到岗时间",
                  questionId: "question-1",
                  valueText: "两周内",
                },
              ],
              templateId: "template-1",
            },
          ],
        },
      },
    } as StudioInterviewConversationReport;

    expect(getReportFormItems(report)).toEqual([
      {
        analysis: null,
        answers: ["两周内"],
        id: "form-0-template-1-question-1",
        kind: "form",
        question: "期望到岗时间",
        sequence: 1,
      },
    ]);
  });

  it("returns null when an older report has no evidence snapshot", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    expect(getReportFormItems({} as StudioInterviewConversationReport)).toBeNull();
  });
});
