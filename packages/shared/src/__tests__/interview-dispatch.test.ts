import { describe, expect, it } from "vitest";
import {
  buildInterviewDispatchContract,
  buildInterviewDispatchMetadata,
  INTERVIEW_DISPATCH_SCHEMA_VERSION,
  interviewDispatchContractSchema,
  selectInterviewDispatchInterviewer,
} from "@arc/shared/interview/dispatch-contract";

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

describe("interview dispatch V1 contract", () => {
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

  it("keeps old workers compatible during the ordered rollout", () => {
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
    expect(metadata.candidate_name).toBe(metadata.candidate.name);
    expect(metadata.interview_record_id).toBe(metadata.session.interviewRecordId);
    expect(metadata.interviewers).toEqual([selectedInterviewer]);
    expect(metadata.round_id).toBe(metadata.session.roundId);
  });

  it("rejects drifted or incomplete contracts", () => {
    const contract = buildInterviewDispatchContract({
      ...baseInput,
      selectedInterviewer: null,
    });

    expect(
      interviewDispatchContractSchema.safeParse({ ...contract, schemaVersion: 2 }).success,
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
});
