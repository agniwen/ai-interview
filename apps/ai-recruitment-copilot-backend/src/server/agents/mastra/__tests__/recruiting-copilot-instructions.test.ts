import { describe, expect, it } from "vitest";
import { buildRecruitingCopilotInstructions } from "../agents/recruiting-copilot-instructions";

describe("buildRecruitingCopilotInstructions", () => {
  it("keeps workspace chat generic when no record is focused", () => {
    const instructions = buildRecruitingCopilotInstructions();

    expect(instructions).toContain("Workspace Recruiting Copilot");
    expect(instructions).not.toContain("resume-1");
  });

  it("binds relative candidate references to the verified focused record", () => {
    const instructions = buildRecruitingCopilotInstructions({
      id: "resume-1",
      kind: "resume_record",
    });

    expect(instructions).toContain("resume-1");
    expect(instructions).toContain("get_resume_record_detail");
    expect(instructions).toContain("不要把界面上下文当作已经读取到的简历内容");
  });

  it("documents resume pool mention tooling", () => {
    const instructions = buildRecruitingCopilotInstructions();

    expect(instructions).toContain("get_resume_pool_detail");
    expect(instructions).toContain("bind_pool_item_to_job");
    expect(instructions).toContain(":resume_pool");
    expect(instructions).toContain("只会写入本对话分析上下文");
    expect(instructions).toContain("propose_recruiting_action");
    expect(instructions).toContain("必须立刻调用 propose_recruiting_action");
    expect(instructions).not.toContain("conversationJobBindingProposal");
  });

  it("does not interpolate candidate data into the system prompt", () => {
    const instructions = buildRecruitingCopilotInstructions({
      id: "resume-1",
      kind: "resume_record",
    });

    expect(instructions).not.toContain("candidateName");
  });
});
