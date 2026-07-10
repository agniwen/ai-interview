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

  it("does not interpolate candidate data into the system prompt", () => {
    const instructions = buildRecruitingCopilotInstructions({
      id: "resume-1",
      kind: "resume_record",
    });

    expect(instructions).not.toContain("candidateName");
  });
});
