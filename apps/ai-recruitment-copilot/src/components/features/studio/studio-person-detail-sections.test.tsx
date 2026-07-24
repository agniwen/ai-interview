import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CollectedCandidateInfoList } from "./studio-person-detail-sections";

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
