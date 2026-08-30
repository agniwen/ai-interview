import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InterviewRules } from "../interview-rules";

describe("InterviewRules", () => {
  it("explains the interview expectations without punitive language", () => {
    const markup = renderToStaticMarkup(<InterviewRules recordingEnabled />);

    expect(markup).toContain("按自己的节奏作答");
    expect(markup).toContain("保持真实、清晰");
    expect(markup).toContain("如有暂时无法确认的问题，您可以如实说明");
    expect(markup).toContain("如有疑问，可先联系招聘负责人");
    expect(markup).not.toContain("影响评分");
    expect(markup).not.toContain("面试官会结束面试");
    expect(markup).not.toContain("期间不能关闭");
  });
});
