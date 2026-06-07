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
});
