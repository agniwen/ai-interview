import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyInterviewInformation } from "../key-interview-information";

describe("KeyInterviewInformation", () => {
  it("renders nothing when every category is empty", () => {
    expect(
      renderToStaticMarkup(
        <KeyInterviewInformation
          data={{ quantitativeInformation: [], risks: [], skillEvidence: [] }}
        />,
      ),
    ).toBe("");
  });

  it("renders populated categories, risk labels, and evidence controls", () => {
    const html = renderToStaticMarkup(
      <KeyInterviewInformation
        data={{
          quantitativeInformation: [
            {
              content: "候选人期望税前年包 60 万元。",
              evidence: [{ quote: "我的期望是税前年包六十万", turnIndex: 4 }],
            },
          ],
          risks: [
            {
              content: "高并发容量估算依据需要进一步核实。",
              evidence: [{ quote: "具体容量我没有算过", turnIndex: 6 }],
              type: "needs_verification",
            },
            {
              content: "候选人的项目数据前后矛盾。",
              evidence: [{ quote: "刚才的数据我记不清了", turnIndex: 8 }],
              type: "observed",
            },
          ],
          skillEvidence: [
            {
              content: "使用 React 负责招聘系统组件架构。",
              evidence: [{ quote: "我负责 React 组件架构", turnIndex: 2 }],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("重点信息");
    expect(html).toContain("关键技能证据");
    expect(html).toContain("关键量化信息");
    expect(html).toContain("风险与待核实");
    expect(html).toContain("待核实");
    expect(html).toContain("明确风险");
    expect(html).toContain("我负责 ");
    expect(html).toContain("组件架构");
    expect(html).toContain("<button");
  });

  it("hides an empty category without claiming that no risk exists", () => {
    const html = renderToStaticMarkup(
      <KeyInterviewInformation
        data={{
          quantitativeInformation: [],
          risks: [],
          skillEvidence: [
            {
              content: "使用 React 负责招聘系统组件架构。",
              evidence: [{ quote: "我负责 React 组件架构", turnIndex: 2 }],
            },
          ],
        }}
      />,
    );

    expect(html).toContain("关键技能证据");
    expect(html).not.toContain("关键量化信息");
    expect(html).not.toContain("风险与待核实");
    expect(html).not.toContain("暂无风险");
  });

  it("uses the latest interview report frame surface when requested", () => {
    const html = renderToStaticMarkup(
      <KeyInterviewInformation
        data={{
          quantitativeInformation: [
            {
              content: "候选人期望税前年包 60 万元。",
              evidence: [{ quote: "我的期望是税前年包六十万", turnIndex: 4 }],
            },
          ],
          risks: [],
          skillEvidence: [],
        }}
        surface="frame"
      />,
    );

    expect(html).toContain('data-slot="frame"');
    expect(html).toContain("重点信息");
  });
});
