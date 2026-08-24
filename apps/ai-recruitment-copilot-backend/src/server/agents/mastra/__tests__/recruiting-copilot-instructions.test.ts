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
    expect(instructions).toContain("用户明确同意绑定后");
    expect(instructions).not.toContain("conversationJobBindingProposal");
  });

  it("treats a mention as context instead of an automatic detail request", () => {
    const instructions = buildRecruitingCopilotInstructions();

    expect(instructions).toContain("出现一个或多个 :resume_record");
    expect(instructions).toContain("仅表示用户选中了这些候选人");
    expect(instructions).toContain("不要仅因 @ 提及就调用工具");
    expect(instructions).toContain("同一次 get_resume_record_detail.requests");
    expect(instructions).toContain("工具前不得输出任何文字");
    expect(instructions).toContain("本轮第一段可见文本必须直接进入最终回答");
  });

  it("streams a temporary markdown assessment before offering a job binding", () => {
    const instructions = buildRecruitingCopilotInstructions();

    expect(instructions).toContain("includeResumeText=true");
    expect(instructions).toContain("先输出流式 Markdown 通用评价");
    expect(instructions).toContain("临时分析结果");
    expect(instructions).toContain("不得写回 resumeReview");
    expect(instructions).toContain("评价完成后再询问用户是否需要绑定岗位");
    expect(instructions).toContain("不得在同一轮提前调用 propose_recruiting_action");
    expect(instructions).toContain("不要给出岗位匹配分数");
  });

  it("requires database-backed six-dimension scores for bound candidates", () => {
    const instructions = buildRecruitingCopilotInstructions();

    expect(instructions).toContain("主动展示该候选人的数据库评分卡");
    expect(instructions).toContain("数据库已有的六维评分");
    expect(instructions).toContain("structuredResumeReview");
    expect(instructions).toContain("两类评分都为空");
    expect(instructions).toContain("不要自行重新估分");
  });

  it("does not interpolate candidate data into the system prompt", () => {
    const instructions = buildRecruitingCopilotInstructions({
      id: "resume-1",
      kind: "resume_record",
    });

    expect(instructions).not.toContain("candidateName");
  });
});
