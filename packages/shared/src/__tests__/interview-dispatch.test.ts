import { describe, expect, it } from "vitest";
import {
  buildInterviewDispatchContract,
  buildInterviewDispatchMetadata,
  INTERVIEW_DISPATCH_SCHEMA_VERSION,
  interviewDispatchContractSchema,
  selectInterviewDispatchInterviewer,
} from "@app/shared/interview/dispatch-contract";

const baseInput = {
  allowTextInput: true,
  candidateName: "郭靖",
  closingInstructions: "再见 {候选人姓名}",
  companyContext: "重视工程质量",
  interviewQuestions: [],
  interviewRecordId: "record-1",
  jobDescriptionPresetQuestions: [
    {
      content: "请介绍一次故障排查经历。",
      difficulty: "medium" as const,
      evaluationFocus: "确认候选人能够定位并复盘线上故障",
      followUpDirections: "追问定位信号、根因与预防措施",
      id: "question-1",
    },
  ],
  jobDescriptionPrompt: "负责核心交易系统",
  openingInstructions: "你好 {候选人姓名}，欢迎面试 {岗位}",
  recordingEnabled: true,
  recordingFileKey: "recordings/room-1.mp4",
  resumeProfile: null,
  roundId: "round-1",
  targetRole: "后端工程师",
};

describe("interview dispatch V2 contract", () => {
  it("selects one interviewer and builds the final prompts in TypeScript", () => {
    const interviewers = [
      { name: "面试官甲", prompt: "保持友好", voice: "voice-a" },
      { name: "面试官乙", prompt: "重点考察系统设计", voice: "voice-b" },
    ];
    const interviewer = selectInterviewDispatchInterviewer(interviewers, baseInput.roundId);
    const repeatedSelection = selectInterviewDispatchInterviewer(interviewers, baseInput.roundId);

    const contract = buildInterviewDispatchContract({
      ...baseInput,
      selectedInterviewer: interviewer,
    });

    expect(contract.schemaVersion).toBe(INTERVIEW_DISPATCH_SCHEMA_VERSION);
    expect(repeatedSelection).toEqual(interviewer);
    expect(contract.selectedInterviewer).toEqual({
      name: interviewer?.name,
      voice: interviewer?.voice,
    });
    expect(contract.prompts.system).toContain(`## 面试官角色设定\n${interviewer?.prompt}`);
    expect(contract.prompts.opening).toBe("你好 郭靖，欢迎面试 后端工程师");
    expect(contract.prompts.closing).toBe("再见 郭靖");
    expect(contract.questions).toEqual([
      {
        content: "请介绍一次故障排查经历。",
        difficulty: "medium",
        evaluationFocus: "确认候选人能够定位并复盘线上故障",
        followUpDirections: "追问定位信号、根因与预防措施",
        id: "question-1",
      },
    ]);
    expect(interviewDispatchContractSchema.parse(contract)).toEqual(contract);
  });

  it("builds the default prompt when no interviewer is configured", () => {
    const contract = buildInterviewDispatchContract({
      ...baseInput,
      selectedInterviewer: null,
    });

    expect(contract.selectedInterviewer).toBeNull();
    expect(contract.prompts.system).not.toContain("## 面试官角色设定");
  });

  it("emits only the V2 contract without a legacy compatibility envelope", () => {
    const selectedInterviewer = {
      name: "面试官甲",
      prompt: "保持友好",
      voice: "voice-a",
    };
    const metadata = buildInterviewDispatchMetadata({
      ...baseInput,
      selectedInterviewer,
    });

    expect(metadata.schemaVersion).toBe(INTERVIEW_DISPATCH_SCHEMA_VERSION);
    expect(metadata).toEqual(buildInterviewDispatchContract({ ...baseInput, selectedInterviewer }));
    expect(metadata).not.toHaveProperty("candidate_name");
  });

  it("rejects drifted or incomplete contracts", () => {
    const contract = buildInterviewDispatchContract({
      ...baseInput,
      selectedInterviewer: null,
    });

    expect(
      interviewDispatchContractSchema.safeParse({ ...contract, schemaVersion: 1 }).success,
    ).toBe(false);
    expect(
      interviewDispatchContractSchema.safeParse({
        ...contract,
        prompts: { opening: contract.prompts.opening, system: contract.prompts.system },
      }).success,
    ).toBe(false);
    expect(
      interviewDispatchContractSchema.safeParse({ ...contract, unexpected: true }).success,
    ).toBe(false);
  });

  it("rejects an interview without a required question", () => {
    expect(() =>
      buildInterviewDispatchContract({
        ...baseInput,
        jobDescriptionPresetQuestions: [],
        selectedInterviewer: null,
      }),
    ).toThrow();
  });
});
