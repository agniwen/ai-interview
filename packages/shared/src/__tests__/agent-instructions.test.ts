import { describe, expect, it } from "vitest";
import { buildAgentInstructions } from "@arc/shared/interview/agent-instructions";

describe("buildAgentInstructions", () => {
  it("uses the candidate language policy instead of forcing Chinese", () => {
    const out = buildAgentInstructions({
      candidateName: "Alex",
      companyContext: "",
      interviewQuestions: [],
      interviewerPrompt: "",
      jobDescriptionPresetQuestions: [],
      jobDescriptionPrompt: "",
      resumeProfile: null,
      targetRole: "Backend Engineer",
    });

    expect(out).toContain("以候选人的主要语言为主");
    expect(out).toContain("题目若与候选人主要语言不同");
    expect(out).not.toContain("全程使用中文交流");
  });

  it("instructs the agent to skip resume-derived supplementary questions when none exist", () => {
    const out = buildAgentInstructions({
      candidateName: "Alex",
      companyContext: "",
      interviewQuestions: [],
      interviewerPrompt: "",
      jobDescriptionPresetQuestions: [
        {
          content: "请介绍一个你负责过的后端项目。",
          difficulty: "easy",
        },
      ],
      jobDescriptionPrompt: "",
      resumeProfile: null,
      targetRole: "Backend Engineer",
    });

    expect(out).toContain("本轮没有从简历生成的补充题目");
    expect(out).toContain("请跳过补充题目环节");
    expect(out).not.toContain("从以下题目中再随机抽取三到五道");
  });
});
