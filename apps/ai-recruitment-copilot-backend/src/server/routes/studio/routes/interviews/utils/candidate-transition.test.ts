import { describe, expect, it } from "vitest";
import {
  getCandidateReactivationError,
  getCandidateStageTransitionError,
  resolveCandidateTransitionPatch,
} from "./candidate-transition";

const now = new Date("2026-06-21T12:00:00.000Z");

describe("getCandidateReactivationError", () => {
  it("requires a non-blank reason when restoring a closed candidate", () => {
    expect(
      getCandidateReactivationError({
        from: "closed",
        reactivationReason: undefined,
        to: "human_interview",
      }),
    ).toBe("请填写重新激活原因。");
    expect(
      getCandidateReactivationError({
        from: "closed",
        reactivationReason: "   ",
        to: "screening",
      }),
    ).toBe("请填写重新激活原因。");
  });

  it("allows a reasoned reactivation and transitions that are not reactivations", () => {
    expect(
      getCandidateReactivationError({
        from: "closed",
        reactivationReason: "候选人补充了新的项目经历",
        to: "human_interview",
      }),
    ).toBeNull();
    expect(
      getCandidateReactivationError({
        from: "screening",
        to: "human_interview",
      }),
    ).toBeNull();
    expect(
      getCandidateReactivationError({
        from: "closed",
        to: "closed",
      }),
    ).toBeNull();
  });
});

describe("resolveCandidateTransitionPatch", () => {
  it("builds a close patch with server-controlled previousStage", () => {
    const result = resolveCandidateTransitionPatch({
      existing: {
        closedMeta: { internalNotes: "keep", previousStage: "screening" },
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
      },
      input: {
        closedMeta: { category: "skills_mismatch" },
        closedReason: "技能匹配度不够",
        outcome: "rejected",
        pipelineStage: "closed",
      },
      now,
    });

    expect(result.patch).toMatchObject({
      closedAt: now,
      closedMeta: {
        category: "skills_mismatch",
        internalNotes: "keep",
        previousStage: "ai_interview",
      },
      closedReason: "技能匹配度不够",
      outcome: "rejected",
      pipelineStage: "closed",
      updatedAt: now,
    });
    expect(result.auditDetail).toEqual({
      closedMeta: {
        category: "skills_mismatch",
        internalNotes: "keep",
        previousStage: "ai_interview",
      },
      fromOutcome: "in_pipeline",
      fromStage: "ai_interview",
      reactivationReason: null,
      reason: "技能匹配度不够",
      toOutcome: "rejected",
      toStage: "closed",
    });
  });

  it("builds a reactivate patch that clears closed and legacy stage fields", () => {
    const result = resolveCandidateTransitionPatch({
      existing: {
        closedMeta: { previousStage: "offer" },
        outcome: "hired",
        pipelineStage: "closed",
      },
      input: {
        outcome: "in_pipeline",
        pipelineStage: "human_interview",
        reactivationReason: "候选人补充了新的项目经历",
      },
      now,
    });

    expect(result.patch).toMatchObject({
      closedAt: null,
      closedMeta: null,
      closedReason: null,
      humanInterviewScheduledAt: null,
      humanInterviewerId: null,
      offerAcceptedAt: null,
      offerSentAt: null,
      outcome: "in_pipeline",
      pipelineStage: "human_interview",
      resumeEvaluationStatus: null,
      updatedAt: now,
      writtenTestScheduledAt: null,
      writtenTestScore: null,
    });
    expect(result.auditDetail.closedMeta).toBeNull();
    expect(result.auditDetail.fromStage).toBe("closed");
    expect(result.auditDetail.reactivationReason).toBe("候选人补充了新的项目经历");
    expect(result.auditDetail.toStage).toBe("human_interview");
  });
});

describe("getCandidateStageTransitionError", () => {
  it("rejects direct offer transitions before human interview", () => {
    expect(
      getCandidateStageTransitionError({
        from: "screening",
        hasJobDescription: true,
        humanInterviewReadyForOffer: true,
        to: "offer",
      }),
    ).toBe("当前招聘阶段不能直接推进到目标阶段。");
    expect(
      getCandidateStageTransitionError({
        from: "ai_interview",
        hasJobDescription: true,
        humanInterviewReadyForOffer: true,
        to: "offer",
      }),
    ).toBe("当前招聘阶段不能直接推进到目标阶段。");
  });

  it("requires human interview readiness for offer transition", () => {
    expect(
      getCandidateStageTransitionError({
        from: "human_interview",
        hasJobDescription: true,
        humanInterviewReadyForOffer: false,
        to: "offer",
      }),
    ).toBe("请先完成所有真人面试轮次，并补全每轮面试评价");
    expect(
      getCandidateStageTransitionError({
        from: "human_interview",
        hasJobDescription: true,
        humanInterviewReadyForOffer: true,
        to: "offer",
      }),
    ).toBeNull();
  });

  it("requires a bound job description before entering human interview", () => {
    expect(
      getCandidateStageTransitionError({
        from: "screening",
        hasJobDescription: false,
        humanInterviewReadyForOffer: false,
        to: "human_interview",
      }),
    ).toBe("请先绑定在招岗位后再安排真人面试");
    expect(
      getCandidateStageTransitionError({
        from: "ai_interview",
        hasJobDescription: false,
        humanInterviewReadyForOffer: false,
        to: "human_interview",
      }),
    ).toBe("请先绑定在招岗位后再安排真人面试");
    expect(
      getCandidateStageTransitionError({
        from: "screening",
        hasJobDescription: true,
        humanInterviewReadyForOffer: false,
        to: "human_interview",
      }),
    ).toBeNull();
  });
});
