import type { HumanInterviewReviewRecord } from "@app/shared/studio-pipeline-stages";

export const evaluation = {
  detailedAnalysis: "服务端详细分析",
  evidenceTurnIds: [],
  overallEvaluation: "服务端整体评价",
  professionalSkill: "优",
  rating: "A" as const,
  risks: "服务端风险",
  rolePosition: "服务端角色",
  salaryRecommendation: "",
  seniorityPosition: "服务端职级",
  strengths: "服务端优势",
};

export function reviewRecord(
  overrides: Partial<HumanInterviewReviewRecord> = {},
): HumanInterviewReviewRecord {
  return {
    evaluation,
    evaluationError: null,
    evaluationStatus: "draft",
    evaluationUpdatedAt: "2026-08-31T00:00:00.000Z",
    evaluationUpdatedBy: "user-1",
    meetingSessionId: "session-1",
    outcome: "inconclusive",
    roundId: "round-1",
    roundStatus: "pending",
    transcript: {
      basedOnRevisionId: null,
      createdAt: "2026-08-31T00:00:00.000Z",
      createdBy: null,
      id: "00000000-0000-4000-8000-000000000001",
      kind: "final",
      language: "zh-CN",
      model: "qwen",
      provider: "qwen",
      region: "cn-beijing",
      revision: 1,
      turns: [
        {
          confidence: 0.9,
          endMs: 1000,
          id: "turn-1",
          sequence: 0,
          speakerDisplayName: "候选人",
          speakerKey: "remote-1",
          startMs: 0,
          text: "服务端转录",
          track: "remote",
        },
      ],
    },
    transcriptionError: null,
    transcriptionState: "ready",
    ...overrides,
  };
}
