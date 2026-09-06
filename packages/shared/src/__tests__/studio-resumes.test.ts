// 单元测试 describeResumeProgress：pure function，不需要 DB。
// Unit test for describeResumeProgress; pure function, no DB needed.

import { describe, expect, it } from "vitest";
import {
  canDeleteResumeRecord,
  canLaunchInterviewFromResume,
  canReopenRecruitingNode,
  createResumeLibraryFormValues,
  describeResumeEvaluationStatus,
  describeResumeProgress,
  resumeEvaluationStatusSchema,
  resumeEvaluationUpdateSchema,
  resumeLibraryEditFormSchema,
  resumeLibraryFormSchema,
} from "../studio-resumes";
import type { ResumeStageProgress } from "../studio-resumes";

// 没有任何子表数据时的空 shape。Empty shape when no subtable rows.
const EMPTY: ResumeStageProgress = {
  aiInterview: null,
  humanInterview: null,
  offer: null,
};

describe("resumeLibraryFormSchema", () => {
  it("requires a job description when saving a resume record", () => {
    const result = resumeLibraryFormSchema.safeParse({
      ...createResumeLibraryFormValues(),
      candidateName: "郭靖",
      jobDescriptionId: "   ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("请选择关联在招岗位");
    }
  });
});

describe("resumeLibraryEditFormSchema", () => {
  it("requires candidate name when editing a resume record", () => {
    const result = resumeLibraryEditFormSchema.safeParse({
      ...createResumeLibraryFormValues(),
      candidateName: "   ",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe("请填写候选人姓名");
    }
  });
});

describe("canDeleteResumeRecord", () => {
  it("locks queued and processing resume records because a batch may still recreate them", () => {
    expect(canDeleteResumeRecord("unparsed")).toBe(true);
    expect(canDeleteResumeRecord("queued")).toBe(false);
    expect(canDeleteResumeRecord("processing")).toBe(false);
    expect(canDeleteResumeRecord("ready")).toBe(true);
    expect(canDeleteResumeRecord("failed")).toBe(true);
  });
});

describe("resume evaluation status", () => {
  it("accepts only pass/fail for direct reviewer submission", () => {
    expect(resumeEvaluationStatusSchema.safeParse("pass").success).toBe(true);
    expect(resumeEvaluationStatusSchema.safeParse("fail").success).toBe(true);
    expect(resumeEvaluationStatusSchema.safeParse(null).success).toBe(false);
  });

  it("allows admins to reset the editable status back to unreviewed", () => {
    expect(resumeEvaluationUpdateSchema.safeParse({ status: null }).success).toBe(true);
    expect(resumeEvaluationUpdateSchema.safeParse({ status: "pass" }).success).toBe(true);
    expect(resumeEvaluationUpdateSchema.safeParse({ status: "unknown" }).success).toBe(false);
  });

  it("describes null as 未评估 and pass/fail as terminal statuses", () => {
    expect(describeResumeEvaluationStatus(null)).toEqual({
      label: "未评估",
      tone: "outline",
    });
    expect(describeResumeEvaluationStatus("pass")).toEqual({
      label: "通过",
      tone: "success",
    });
    expect(describeResumeEvaluationStatus("fail")).toEqual({
      label: "不通过",
      tone: "danger",
    });
  });
});

describe("describeResumeProgress", () => {
  it("screening → 简历筛选 · 待处理", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "screening",
        stageProgress: EMPTY,
      }),
    ).toEqual({ label: "简历筛选 · 待处理", tone: "outline" });
  });

  it("screening with queued review → 简历筛选 · 分析中", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "screening",
        resumeReviewStatus: "queued",
        stageProgress: EMPTY,
      }),
    ).toEqual({ label: "简历筛选 · 分析中", tone: "warning" });
  });

  it("ai_interview 无排期 → 未排期", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
        stageProgress: EMPTY,
      }),
    ).toEqual({ label: "AI 面试 · 未排期", tone: "outline" });
  });

  it("ai_interview 第 1 轮 pending、未开始 → 等候候选人进场", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
        stageProgress: {
          aiInterview: {
            activeRound: { roundLabel: "一面", sortOrder: 0, status: "pending" },
            completedRounds: 0,
            hasStarted: false,
            totalRounds: 3,
          },
          humanInterview: null,
          offer: null,
        },
      }),
    ).toEqual({ label: "AI 面试 · 第 1/3 轮 · 等候候选人进场", tone: "info" });
  });

  it("ai_interview 第 2 轮 in_progress → 进行中", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
        stageProgress: {
          aiInterview: {
            activeRound: { roundLabel: "二面", sortOrder: 1, status: "in_progress" },
            completedRounds: 1,
            hasStarted: true,
            totalRounds: 3,
          },
          humanInterview: null,
          offer: null,
        },
      }),
    ).toEqual({ label: "AI 面试 · 第 2/3 轮 · 进行中", tone: "warning" });
  });

  it("ai_interview 第 3 轮 pending、已有完成 → 等候下一轮", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
        stageProgress: {
          aiInterview: {
            activeRound: { roundLabel: "三面", sortOrder: 2, status: "pending" },
            completedRounds: 2,
            hasStarted: true,
            totalRounds: 3,
          },
          humanInterview: null,
          offer: null,
        },
      }),
    ).toEqual({ label: "AI 面试 · 第 3/3 轮 · 等候下一轮", tone: "info" });
  });

  it("ai_interview 全部 completed → 待决策", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
        stageProgress: {
          aiInterview: {
            activeRound: null,
            completedRounds: 3,
            hasStarted: true,
            totalRounds: 3,
          },
          humanInterview: null,
          offer: null,
        },
      }),
    ).toEqual({ label: "AI 面试 · 已完成 (3/3) · 待决策", tone: "success" });
  });

  it("interrupted 也算「进行中」（schedule meta 同语义）", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
        stageProgress: {
          aiInterview: {
            activeRound: { roundLabel: "一面", sortOrder: 0, status: "interrupted" },
            completedRounds: 0,
            hasStarted: true,
            totalRounds: 1,
          },
          humanInterview: null,
          offer: null,
        },
      }),
    ).toEqual({ label: "AI 面试 · 第 1/1 轮 · 进行中", tone: "warning" });
  });

  // ── second_interview ──

  it("second_interview 未安排 → 未安排", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "second_interview",
        stageProgress: EMPTY,
      }),
    ).toEqual({ label: "复试 · 未安排", tone: "outline" });
  });

  it("second_interview 第 1 轮 pending 已定时间 → 已安排", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "second_interview",
        stageProgress: {
          aiInterview: null,
          humanInterview: {
            activeRound: {
              id: "r1",
              label: "技术复面",
              outcome: null,
              scheduledAt: "2026-05-25T10:00:00Z",
              sortOrder: 0,
              status: "pending",
            },
            completedRounds: 0,
            completedRoundsMissingFeedback: 0,
            failedRounds: 0,
            passedRounds: 0,
            totalRounds: 2,
          },
          offer: null,
        },
      }),
    ).toEqual({
      label: "复试 · 第 1/2 轮（技术复面）· 已安排",
      tone: "info",
    });
  });

  it("second_interview 第 1 轮 pending 未定时间 → 待安排", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "second_interview",
        stageProgress: {
          aiInterview: null,
          humanInterview: {
            activeRound: {
              id: "r1",
              label: "HR 复面",
              outcome: null,
              scheduledAt: null,
              sortOrder: 0,
              status: "pending",
            },
            completedRounds: 0,
            completedRoundsMissingFeedback: 0,
            failedRounds: 0,
            passedRounds: 0,
            totalRounds: 1,
          },
          offer: null,
        },
      }),
    ).toEqual({
      label: "复试 · 第 1/1 轮（HR 复面）· 待安排",
      tone: "info",
    });
  });

  it("second_interview 全部完成 → 显示通过/总数 + 待决策", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "second_interview",
        stageProgress: {
          aiInterview: null,
          humanInterview: {
            activeRound: null,
            completedRounds: 2,
            completedRoundsMissingFeedback: 0,
            failedRounds: 0,
            passedRounds: 2,
            totalRounds: 2,
          },
          offer: null,
        },
      }),
    ).toEqual({
      label: "复试 · 全部完成 (2/2 通过) · 待决策",
      tone: "success",
    });
  });

  // ── offer ──

  it("offer 阶段无 draft → 待发出", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "offer",
        stageProgress: EMPTY,
      }),
    ).toEqual({ label: "Offer · 待发出", tone: "outline" });
  });

  it("offer v1 sent → 已发送 · 等响应（单版本时不显示版本号）", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "offer",
        stageProgress: {
          aiInterview: null,
          humanInterview: null,
          offer: {
            latestDraft: {
              id: "o1",
              responseAt: null,
              sentAt: "2026-05-25T10:00:00Z",
              status: "sent",
              version: 1,
            },
            totalVersions: 1,
          },
        },
      }),
    ).toEqual({ label: "Offer · 已发送 · 等响应", tone: "info" });
  });

  it("offer v2 sent → 显示版本号", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "offer",
        stageProgress: {
          aiInterview: null,
          humanInterview: null,
          offer: {
            latestDraft: {
              id: "o2",
              responseAt: null,
              sentAt: "2026-05-26T10:00:00Z",
              status: "sent",
              version: 2,
            },
            totalVersions: 2,
          },
        },
      }),
    ).toEqual({ label: "Offer v2 · 已发送 · 等响应", tone: "info" });
  });

  it("offer accepted → 已接受 · 待结束", () => {
    expect(
      describeResumeProgress({
        outcome: "in_pipeline",
        pipelineStage: "offer",
        stageProgress: {
          aiInterview: null,
          humanInterview: null,
          offer: {
            latestDraft: {
              id: "o1",
              responseAt: "2026-05-26T15:00:00Z",
              sentAt: "2026-05-25T10:00:00Z",
              status: "accepted",
              version: 1,
            },
            totalVersions: 1,
          },
        },
      }),
    ).toEqual({ label: "Offer · 已接受 · 待结束", tone: "success" });
  });

  // ── closed ──

  it("closed × hired → 已结束 · 已入职", () => {
    expect(
      describeResumeProgress({
        outcome: "hired",
        pipelineStage: "closed",
        stageProgress: EMPTY,
      }),
    ).toEqual({ label: "已结束 · 已入职", tone: "success" });
  });

  it("closed × archived → 已归档", () => {
    expect(
      describeResumeProgress({
        outcome: "archived",
        pipelineStage: "closed",
        stageProgress: EMPTY,
      }),
    ).toEqual({ label: "已归档", tone: "outline" });
  });

  it("closed × rejected → 已结束 · 已淘汰", () => {
    expect(
      describeResumeProgress({
        outcome: "rejected",
        pipelineStage: "closed",
        stageProgress: EMPTY,
      }),
    ).toEqual({ label: "已结束 · 已淘汰", tone: "outline" });
  });
});

describe("canLaunchInterviewFromResume", () => {
  it.each(["screening", "ai_interview"] as const)(
    "筛选通过、解析完成且位于 %s 时允许发起 AI 面试",
    (stage) => {
      expect(canLaunchInterviewFromResume("ready", stage, "pass")).toBe(true);
      expect(canLaunchInterviewFromResume("processing", stage)).toBe(false);
      expect(canLaunchInterviewFromResume("failed", stage)).toBe(false);
    },
  );
  it.each([
    "second_interview",
    "final_interview",
    "income_proof",
    "offer",
    "background_check",
    "onboarding",
    "closed",
  ] as const)("%s 必须先回退，不能直接发起 AI 面试", (stage) => {
    expect(canLaunchInterviewFromResume("ready", stage)).toBe(false);
  });
});

describe("迁移历史节点的回退资格", () => {
  const record = {
    closedFromNode: null,
    nodeStates: [
      { enteredAt: null, node: "screening" as const, status: "completed" as const },
      { enteredAt: null, node: "ai_interview" as const, status: "skipped" as const },
      { enteredAt: null, node: "second_interview" as const, status: "pending" as const },
      { enteredAt: null, node: "final_interview" as const, status: "inactive" as const },
    ],
    pipelineStage: "second_interview" as const,
  };
  it("进入时间未知仍允许当前复试及已走过/跳过的前序节点", () => {
    expect(canReopenRecruitingNode(record, "screening")).toBe(true);
    expect(canReopenRecruitingNode(record, "ai_interview")).toBe(true);
    expect(canReopenRecruitingNode(record, "second_interview")).toBe(true);
    expect(canReopenRecruitingNode(record, "final_interview")).toBe(false);
  });
  it("已结束时以closedFromNode为界，未来节点即使存在历史状态也不可越过", () => {
    const closed = {
      ...record,
      closedFromNode: "ai_interview" as const,
      pipelineStage: "closed" as const,
    };
    expect(canReopenRecruitingNode(closed, "ai_interview")).toBe(true);
    expect(canReopenRecruitingNode(closed, "second_interview")).toBe(false);
  });
  it("没有时间且从未到达的前序节点仍不可选", () => {
    expect(
      canReopenRecruitingNode(
        { ...record, nodeStates: [{ enteredAt: null, node: "screening", status: "inactive" }] },
        "screening",
      ),
    ).toBe(false);
  });
});
