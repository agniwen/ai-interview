import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
/* oxlint-disable max-lines -- integration suite covering human-interview and offer subtable lifecycle invariants. */
// 真人复面 + Offer 子表 DAO 的集成测试。覆盖：
//   1. 真人复面：create（自动 advance pipelineStage）→ complete → cancel；status 守卫
//   2. Offer：create（auto-supersede 旧 sent 版本）→ patch（仅 draft 时）→ send → respond
//   3. respond=accepted 后不再允许编辑，cancel 把 sent → expired
//
// Integration tests for human-interview + offer subtable DAOs.

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import {
  recruitingRecord,
  recruitingNodeState,
  recruitingFulfillment,
  recruitingNodeValues,
  meetingSession,
  meetingTranscriptRevision,
  member,
  organization,
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  humanInterviewRoundInterviewer,
  recruitingOffer,
  user,
} from "@app/db-schema/schema";
import {
  cancelHumanInterviewRound,
  completeHumanInterviewRound,
  createHumanInterviewRound,
  editHumanInterviewRound,
  EditRoundError,
  listHumanInterviewRounds,
} from "../dao/human-interview-rounds";
import {
  createHumanInterviewMeeting,
  claimHumanInterviewRecordingStartByRoomName,
  endHumanInterviewMeetingsByRound,
  HumanInterviewMeetingError,
  isHumanInterviewMeetingAfterValidUntil,
  listHumanInterviewMeetings,
  markHumanInterviewRecordingCompleted,
  markHumanInterviewRecordingFailed,
  markHumanInterviewRecordingStarted,
  markHumanInterviewParticipantJoined,
  markHumanInterviewParticipantLeft,
} from "../dao/human-interview-meetings";
import {
  listHumanInterviewEvaluationSnapshotsForAnalysis,
  loadHumanInterviewReview,
  publishHumanInterviewEvaluation,
  recoverHumanInterviewReviewFromLiveTranscript,
  requestHumanInterviewEvaluation,
  saveHumanInterviewEvaluationDraft,
  submitHumanInterviewEvaluation,
} from "../dao/human-interview-evaluation";
import {
  loadHumanInterviewLiveTranscriptDraft,
  saveHumanInterviewLiveTranscriptDraft,
} from "../dao/human-interview-live-transcript";
import {
  listRecoverableHumanInterviewRecordingJobs,
  saveHumanInterviewRecordingProcessingError,
} from "../dao/human-interview-recording-processing";
import {
  cancelOfferDraft,
  createOfferDraft,
  editOfferDraft,
  listOfferDrafts,
  maybeAdvanceToOffer,
  OfferDraftError,
  respondOfferDraft,
  sendOfferDraft,
} from "../dao/offer-drafts";

const ORG = "test_org_pipeline_subtables";
const HR_USER = "test_user_pipeline_hr";
const INTERVIEWER_A = "test_user_pipeline_int_a";
const INTERVIEWER_B = "test_user_pipeline_int_b";
const RECORD_ID = "ri_pipeline_subtables_1";
const RECORD_ID_B = "ri_pipeline_subtables_2";
const NOW = new Date("2026-05-22T08:00:00.000Z");

async function cleanup() {
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORG));
  await db.delete(member).where(eq(member.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, HR_USER));
  await db.delete(user).where(eq(user.id, INTERVIEWER_A));
  await db.delete(user).where(eq(user.id, INTERVIEWER_B));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values([
    {
      createdAt: NOW,
      email: "hr-pipeline@example.com",
      emailVerified: false,
      id: HR_USER,
      name: "HR pipeline",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "int-a@example.com",
      emailVerified: false,
      id: INTERVIEWER_A,
      name: "面试官 A",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "int-b@example.com",
      emailVerified: false,
      id: INTERVIEWER_B,
      name: "面试官 B",
      updatedAt: NOW,
    },
  ]);
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Pipeline Subtables Org",
    slug: "test-pipeline-subtables",
  });
  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "m_pipeline_hr",
      organizationId: ORG,
      role: "owner",
      userId: HR_USER,
    },
    {
      createdAt: NOW,
      id: "m_pipeline_int_a",
      organizationId: ORG,
      role: "member",
      userId: INTERVIEWER_A,
    },
    {
      createdAt: NOW,
      id: "m_pipeline_int_b",
      organizationId: ORG,
      role: "member",
      userId: INTERVIEWER_B,
    },
  ]);
  await createRecruitingRecords(db, [
    {
      candidateName: "复面测试",
      createdAt: NOW,
      createdBy: HR_USER,
      id: RECORD_ID,
      interviewQuestions: [],
      organizationId: ORG,
      pipelineStage: "ai_interview",
      updatedAt: NOW,
    },
    {
      candidateName: "群面候选人",
      createdAt: NOW,
      createdBy: HR_USER,
      id: RECORD_ID_B,
      interviewQuestions: [],
      organizationId: ORG,
      pipelineStage: "second_interview",
      updatedAt: NOW,
    },
  ]);
});

afterAll(async () => {
  await cleanup();
});

function fixtureNodeStatus(
  node: (typeof recruitingNodeValues)[number],
  stage: (typeof recruitingNodeValues)[number],
  index: number,
) {
  if (node === stage) {
    return "pending" as const;
  }
  if (index < recruitingNodeValues.indexOf(stage)) {
    return "skipped" as const;
  }
  return "inactive" as const;
}

async function resetCandidateStage(
  stage:
    | "ai_interview"
    | "second_interview"
    | "final_interview"
    | "income_proof"
    | "offer"
    | "background_check"
    | "onboarding",
) {
  // 测试安排直接创建期望起点；业务代码禁止通过元数据 patch 绕过流程事务。
  await db
    .update(recruitingRecord)
    .set({
      closeDetails: null,
      closeReason: null,
      closedAt: null,
      closedFromNode: null,
      currentStage: stage,
      outcome: "in_pipeline",
    })
    .where(eq(recruitingRecord.id, RECORD_ID));
  await db.delete(recruitingNodeState).where(eq(recruitingNodeState.recruitingRecordId, RECORD_ID));
  await db.insert(recruitingNodeState).values(
    recruitingNodeValues.map((node, index) => ({
      enteredAt: index <= recruitingNodeValues.indexOf(stage) ? new Date() : null,
      node,
      organizationId: ORG,
      recruitingRecordId: RECORD_ID,
      status: fixtureNodeStatus(node, stage, index),
    })),
  );
}

async function clearSubtables() {
  await db.delete(recruitingNodeState).where(eq(recruitingNodeState.organizationId, ORG));
  await db
    .update(recruitingFulfillment)
    .set({ selectedOfferId: null })
    .where(eq(recruitingFulfillment.organizationId, ORG));
  await db.delete(humanInterviewMeeting).where(eq(humanInterviewMeeting.organizationId, ORG));
  await db
    .delete(humanInterviewRoundInterviewer)
    .where(sql`round_id IN (SELECT id FROM human_interview_round WHERE organization_id = ${ORG})`);
  await db.delete(humanInterviewRound).where(eq(humanInterviewRound.organizationId, ORG));
  await db.delete(recruitingOffer).where(eq(recruitingOffer.recruitingRecordId, RECORD_ID));
  await resetCandidateStage("second_interview");
}

describe("human interview rounds DAO", () => {
  it("createHumanInterviewRound 写入 round + interviewer junction，sortOrder 自增", async () => {
    await clearSubtables();
    await resetCandidateStage("ai_interview");

    const round1 = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "技术复面",
        meetingUrl: "https://meet.example.com/room1",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(round1.sortOrder).toBe(0);
    expect(round1.interviewers.map((i) => i.id)).toEqual([INTERVIEWER_A]);

    await expect(
      createHumanInterviewRound({
        input: {
          format: "onsite",
          interviewerIds: [INTERVIEWER_A, INTERVIEWER_B],
          label: "HR 复面",
          location: "上海办公室",
          roundKind: "second_interview",
        },
        interviewRecordId: RECORD_ID,
        organizationId: ORG,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("标记完成") });
    await completeHumanInterviewRound({
      feedback: "技术能力符合要求",
      organizationId: ORG,
      outcome: "pass",
      roundId: round1.id,
    });

    const round2 = await createHumanInterviewRound({
      input: {
        format: "onsite",
        interviewerIds: [INTERVIEWER_A, INTERVIEWER_B],
        label: "HR 复面",
        location: "上海办公室",
        roundKind: "final_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(round2.sortOrder).toBe(1);
    expect(round2.interviewers).toHaveLength(2);
  });

  it("创建真人面试原子进入复试，进入 Offer 后不能创建真人轮次", async () => {
    await clearSubtables();
    await resetCandidateStage("ai_interview");
    const created = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "首轮",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const [row] = await db
      .select()
      .from(recruitingRecord)
      .where(eq(recruitingRecord.id, RECORD_ID));
    expect(row?.currentStage).toBe("second_interview");
    await cancelHumanInterviewRound({ organizationId: ORG, roundId: created.id });
    await resetCandidateStage("offer");
    await expect(
      createHumanInterviewRound({
        input: {
          format: "online",
          interviewerIds: [INTERVIEWER_A],
          label: "不能倒退",
          roundKind: "second_interview",
        },
        interviewRecordId: RECORD_ID,
        organizationId: ORG,
      }),
    ).rejects.toThrow("前序");
  });

  it("completeHumanInterviewRound 写 outcome + feedback 且不再写数字评分；非 pending 拒绝", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "phone",
        interviewerIds: [INTERVIEWER_A],
        label: "电话面",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const completed = await completeHumanInterviewRound({
      feedback: "技术扎实",
      organizationId: ORG,
      outcome: "pass",
      roundId: round.id,
    });
    expect(completed.status).toBe("completed");
    expect(completed.outcome).toBe("pass");
    expect(completed.score).toBeNull();
    expect(completed.completedAt).not.toBeNull();

    // 已完成轮次再次 complete 应被拒。
    await expect(
      completeHumanInterviewRound({
        organizationId: ORG,
        outcome: "fail",
        roundId: round.id,
      }),
    ).rejects.toBeInstanceOf(EditRoundError);
  });

  it("cancelHumanInterviewRound 仅作用于 pending；completed 的不可取消", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "可取消轮",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        notes: null,
        roundIds: [round.id],
        scheduledAt: null,
        title: "可取消轮",
      },
      organizationId: ORG,
    });
    const cancelled = await cancelHumanInterviewRound({
      organizationId: ORG,
      reason: "候选人请假",
      roundId: round.id,
    });
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("候选人请假");
    const meetings = await listHumanInterviewMeetings({
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(meetings).toHaveLength(1);
    expect(meetings[0]).toMatchObject({ status: "cancelled" });

    // 完成轮：再 cancel 应 400。
    const round2 = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "已完成轮",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await completeHumanInterviewRound({
      feedback: "通过",
      organizationId: ORG,
      outcome: "pass",
      roundId: round2.id,
    });
    await expect(
      cancelHumanInterviewRound({ organizationId: ORG, roundId: round2.id }),
    ).rejects.toBeInstanceOf(EditRoundError);
  });

  it("listHumanInterviewRounds 按 sortOrder asc 返回所有（含 cancelled）", async () => {
    await clearSubtables();
    const r1 = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "1",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await cancelHumanInterviewRound({ organizationId: ORG, roundId: r1.id });
    const r2 = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "2",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });

    const list = await listHumanInterviewRounds(RECORD_ID, ORG);
    expect(list.map((r) => r.id)).toEqual([r1.id, r2.id]);
    expect(list[0]?.status).toBe("cancelled");
    expect(list[1]?.status).toBe("pending");
  });

  it("listHumanInterviewRounds 返回当前完整定性评价", async () => {
    await clearSubtables();
    const created = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "完整评价",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const evaluation = {
      detailedAnalysis: "逐轮分析与完整对话结论",
      evidenceTurnIds: ["turn-1"],
      overallEvaluation: "整体评价内容",
      professionalSkill: "优",
      rating: "A" as const,
      risks: "规模化落地经验仍需确认",
      rolePosition: "核心方案负责人",
      salaryRecommendation: "",
      seniorityPosition: "高级专家",
      strengths: "架构思路清晰",
    };
    await db
      .update(humanInterviewRound)
      .set({ evaluation, evaluationStatus: "draft" })
      .where(eq(humanInterviewRound.id, created.id));

    const [listed] = await listHumanInterviewRounds(RECORD_ID, ORG);

    expect(listed).toMatchObject({ evaluation, evaluationStatus: "draft" });
  });

  it("createHumanInterviewRound 只在上一轮完成且通过后推进", async () => {
    await clearSubtables();
    const failedRound = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "技术一面",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await completeHumanInterviewRound({
      feedback: "未达到岗位要求",
      organizationId: ORG,
      outcome: "fail",
      roundId: failedRound.id,
    });

    await expect(
      createHumanInterviewRound({
        input: {
          format: "online",
          interviewerIds: [INTERVIEWER_A],
          label: "技术二面",
          roundKind: "second_interview",
        },
        interviewRecordId: RECORD_ID,
        organizationId: ORG,
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining("重新激活") });
  });

  it("editHumanInterviewRound 同步 scheduled 会议时间，已结束会议拒绝调整", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "可改时间",
        roundKind: "second_interview",
        scheduledAt: "2026-05-30T10:00:00.000Z",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        scheduledAt: "2026-05-30T10:00:00.000Z",
        title: "可改时间",
      },
      organizationId: ORG,
    });

    const nextTime = "2026-05-31T09:30:00.000Z";
    const updated = await editHumanInterviewRound({
      input: { scheduledAt: nextTime },
      organizationId: ORG,
      roundId: round.id,
    });
    expect(updated.scheduledAt).toBe(nextTime);
    const [meeting] = await listHumanInterviewMeetings({
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(meeting?.scheduledAt).toBe(nextTime);
    expect(meeting?.validUntil).toBe("2026-05-31T10:30:00.000Z");

    await endHumanInterviewMeetingsByRound({ organizationId: ORG, roundId: round.id });
    await expect(
      editHumanInterviewRound({
        input: { scheduledAt: "2026-06-01T09:30:00.000Z" },
        organizationId: ORG,
        roundId: round.id,
      }),
    ).rejects.toBeInstanceOf(EditRoundError);
  });
});

describe("human interview meetings DAO", () => {
  it("createHumanInterviewMeeting 只关联一个候选人轮次并支持多个面试官", async () => {
    await clearSubtables();

    const roundA = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A, INTERVIEWER_B],
        label: "技术复面",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        roundIds: [roundA.id],
        scheduledAt: "2026-05-30T10:00:00.000Z",
        title: "技术复面",
      },
      organizationId: ORG,
    });

    expect(meeting.liveKitRoomName).toMatch(/^human_/);
    expect(meeting.rounds.map((r) => r.interviewRecordId)).toEqual([RECORD_ID]);
    expect(meeting.interviewers.map((i) => i.id).toSorted()).toEqual(
      [INTERVIEWER_A, INTERVIEWER_B].toSorted(),
    );
    expect(meeting.interviewers.find((i) => i.id === INTERVIEWER_A)?.role).toBe("host");
    expect(meeting.validUntil).toBe("2026-05-30T11:00:00.000Z");

    await expect(
      createHumanInterviewMeeting({
        createdBy: HR_USER,
        input: {
          roundIds: [roundA.id, crypto.randomUUID()],
          title: "无效群面",
        },
        organizationId: ORG,
      }),
    ).rejects.toMatchObject({ message: "一场真人复面会议只能关联一个候选人轮次。" });

    const forCandidate = await listHumanInterviewMeetings({
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(forCandidate).toHaveLength(1);
    expect(forCandidate[0]?.id).toBe(meeting.id);

    await expect(
      createHumanInterviewMeeting({
        createdBy: HR_USER,
        input: {
          interviewerIds: [INTERVIEWER_A],
          roundIds: [roundA.id],
          title: "重复会议",
        },
        organizationId: ORG,
      }),
    ).rejects.toBeInstanceOf(HumanInterviewMeetingError);
  });

  it("createHumanInterviewMeeting 使用显式有效时间至并拒绝早于面试时间的值", async () => {
    await clearSubtables();

    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "技术复面",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });

    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        scheduledAt: "2026-05-30T10:00:00.000Z",
        title: "技术复面会议",
        validUntil: "2026-05-30T10:45:00.000Z",
      },
      organizationId: ORG,
    });

    expect(meeting.validUntil).toBe("2026-05-30T10:45:00.000Z");
    expect(
      isHumanInterviewMeetingAfterValidUntil(meeting.validUntil, "2026-05-30T10:44:59.000Z"),
    ).toBe(false);
    expect(
      isHumanInterviewMeetingAfterValidUntil(meeting.validUntil, "2026-05-30T10:45:01.000Z"),
    ).toBe(true);

    const anotherRound = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "HR 复面",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID_B,
      organizationId: ORG,
    });
    await expect(
      createHumanInterviewMeeting({
        createdBy: HR_USER,
        input: {
          interviewerIds: [INTERVIEWER_A],
          roundIds: [anotherRound.id],
          scheduledAt: "2026-05-30T10:00:00.000Z",
          title: "无效会议",
          validUntil: "2026-05-30T09:59:00.000Z",
        },
        organizationId: ORG,
      }),
    ).rejects.toBeInstanceOf(HumanInterviewMeetingError);
  });

  it("createHumanInterviewMeeting 拒绝已完成轮次", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "已完成",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await completeHumanInterviewRound({
      feedback: "通过",
      organizationId: ORG,
      outcome: "pass",
      roundId: round.id,
    });

    await expect(
      createHumanInterviewMeeting({
        createdBy: HR_USER,
        input: {
          interviewerIds: [INTERVIEWER_A],
          roundIds: [round.id],
          title: "不应创建",
        },
        organizationId: ORG,
      }),
    ).rejects.toBeInstanceOf(HumanInterviewMeetingError);
  });

  it("endHumanInterviewMeetingsByRound 结束该轮次关联的未结束会议", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "技术复面",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        title: "技术复面会议",
      },
      organizationId: ORG,
    });

    const roomNames = await endHumanInterviewMeetingsByRound({
      organizationId: ORG,
      roundId: round.id,
    });

    expect(roomNames).toEqual([meeting.liveKitRoomName]);
    const [ended] = await listHumanInterviewMeetings({
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(ended?.status).toBe("ended");
    expect(ended?.endedAt).not.toBeNull();
  });

  it("按面试官保存实时字幕草稿，并在会议结束后拒绝继续覆盖", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "实时字幕",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        title: "实时字幕会议",
      },
      organizationId: ORG,
    });
    const draft = {
      capturedAt: "2026-09-01T02:00:00.000Z",
      droppedAudioMs: 0,
      droppedPcmFrames: 0,
      error: null,
      sections: [
        {
          id: "section-1",
          sequence: 0,
          startedAt: "2026-09-01T01:59:00.000Z",
          track: "microphone" as const,
        },
      ],
      turns: [
        {
          final: true,
          id: "turn-1",
          sectionId: "section-1",
          text: "这是已持久化的实时字幕",
          track: "microphone" as const,
        },
      ],
    };

    await expect(
      saveHumanInterviewLiveTranscriptDraft({
        draft,
        expectedVersion: 0,
        meetingId: meeting.id,
        organizationId: ORG,
        userId: INTERVIEWER_A,
      }),
    ).resolves.toEqual({ version: 1 });
    await expect(
      loadHumanInterviewLiveTranscriptDraft({
        meetingId: meeting.id,
        userId: INTERVIEWER_A,
      }),
    ).resolves.toEqual({ draft, version: 1 });

    await expect(
      saveHumanInterviewLiveTranscriptDraft({
        draft: { ...draft, capturedAt: "2026-09-01T02:00:30.000Z" },
        expectedVersion: 0,
        meetingId: meeting.id,
        organizationId: ORG,
        userId: INTERVIEWER_A,
      }),
    ).resolves.toBeNull();
    await expect(
      loadHumanInterviewLiveTranscriptDraft({
        meetingId: meeting.id,
        userId: INTERVIEWER_A,
      }),
    ).resolves.toEqual({ draft, version: 1 });

    await endHumanInterviewMeetingsByRound({ organizationId: ORG, roundId: round.id });
    await expect(
      saveHumanInterviewLiveTranscriptDraft({
        draft: { ...draft, capturedAt: "2026-09-01T02:01:00.000Z" },
        expectedVersion: 1,
        meetingId: meeting.id,
        organizationId: ORG,
        userId: INTERVIEWER_A,
      }),
    ).resolves.toBeNull();
  });

  it("完整录音缺失时可显式使用已保存实时字幕进入统一评价流程", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "字幕恢复",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        title: "字幕恢复会议",
      },
      organizationId: ORG,
    });
    const draft = {
      capturedAt: "2026-09-01T02:02:00.000Z",
      droppedAudioMs: 0,
      droppedPcmFrames: 0,
      error: null,
      sections: [
        {
          id: "section-local",
          sequence: 0,
          startedAt: "2026-09-01T02:00:00.000Z",
          track: "microphone" as const,
        },
        {
          id: "section-remote",
          sequence: 1,
          startedAt: "2026-09-01T02:00:00.000Z",
          track: "system" as const,
        },
      ],
      turns: [
        {
          endMs: 2000,
          final: true,
          id: "turn-local",
          sectionId: "section-local",
          startMs: 500,
          text: "请介绍一下项目经验。",
          track: "microphone" as const,
        },
        {
          endMs: 5000,
          final: true,
          id: "turn-remote",
          sectionId: "section-remote",
          startMs: 2500,
          text: "我负责过核心系统改造。",
          track: "system" as const,
        },
      ],
    };
    await saveHumanInterviewLiveTranscriptDraft({
      draft,
      expectedVersion: 0,
      meetingId: meeting.id,
      organizationId: ORG,
      userId: INTERVIEWER_A,
    });
    await endHumanInterviewMeetingsByRound({ organizationId: ORG, roundId: round.id });

    const recovered = await recoverHumanInterviewReviewFromLiveTranscript({
      actorId: INTERVIEWER_A,
      meetingId: meeting.id,
      organizationId: ORG,
      roundId: round.id,
    });
    expect(recovered).toMatchObject({ status: "ready" });
    const review = await loadHumanInterviewReview({
      meetingId: meeting.id,
      organizationId: ORG,
      roundId: round.id,
    });
    expect(review?.transcriptionState).toBe("ready");
    expect(review?.transcript?.turns).toMatchObject([
      { speakerDisplayName: "面试官 A", speakerKey: `interviewer:${INTERVIEWER_A}` },
      { speakerDisplayName: "复面测试", speakerKey: `candidate:${round.id}` },
    ]);
    await expect(
      recoverHumanInterviewReviewFromLiveTranscript({
        actorId: INTERVIEWER_A,
        meetingId: meeting.id,
        organizationId: ORG,
        roundId: round.id,
      }),
    ).resolves.toMatchObject({ status: "ready" });
  });

  it("转录失败或缺失时仍可保存并提交面试官人工评价", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "人工评价",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        title: "无转录人工评价会议",
      },
      organizationId: ORG,
    });
    const evaluation = {
      detailedAnalysis: "基于面试官现场观察给出的完整分析",
      evidenceTurnIds: [],
      overallEvaluation: "人工整体评价",
      professionalSkill: "良",
      rating: "B" as const,
      risks: "人工确认风险",
      rolePosition: "执行者",
      salaryRecommendation: "",
      seniorityPosition: "中级",
      strengths: "人工确认优势",
    };

    await expect(
      saveHumanInterviewEvaluationDraft({
        actorId: INTERVIEWER_A,
        evaluation,
        meetingSessionId: null,
        organizationId: ORG,
        roundId: round.id,
        transcriptRevisionId: null,
      }),
    ).resolves.toBe(true);
    await expect(
      submitHumanInterviewEvaluation({
        actorId: INTERVIEWER_A,
        evaluation,
        meetingSessionId: null,
        organizationId: ORG,
        outcome: "pass",
        roundId: round.id,
        transcriptRevisionId: null,
      }),
    ).resolves.toBe(true);

    // A stale second interviewer tab must not replace a finalized evaluation.
    await expect(
      saveHumanInterviewEvaluationDraft({
        actorId: INTERVIEWER_B,
        evaluation: { ...evaluation, overallEvaluation: "旧页面草稿" },
        meetingSessionId: null,
        organizationId: ORG,
        roundId: round.id,
        transcriptRevisionId: null,
      }),
    ).resolves.toBe(false);
    await expect(
      submitHumanInterviewEvaluation({
        actorId: INTERVIEWER_B,
        evaluation: { ...evaluation, overallEvaluation: "旧页面再次提交" },
        meetingSessionId: null,
        organizationId: ORG,
        outcome: "pass",
        roundId: round.id,
        transcriptRevisionId: null,
      }),
    ).resolves.toBe(false);

    const review = await listHumanInterviewRounds(RECORD_ID, ORG);
    expect(review[0]).toMatchObject({
      evaluation,
      evaluationStatus: "submitted",
      evaluationTranscriptRevisionId: null,
      outcome: "pass",
      status: "completed",
    });
    const snapshots = await listHumanInterviewEvaluationSnapshotsForAnalysis({
      organizationId: ORG,
      roundId: round.id,
    });
    expect(snapshots).toMatchObject([
      {
        evaluation,
        meetingSessionId: null,
        source: "human_submitted",
        transcriptRevisionId: null,
      },
    ]);
  });

  it("过期的录音启动占用可由后续入会事件重新接管", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "录音恢复",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        title: "录音恢复会议",
      },
      organizationId: ORG,
    });
    await db
      .update(humanInterviewMeetingRound)
      .set({ joinedAt: NOW })
      .where(eq(humanInterviewMeetingRound.meetingId, meeting.id));
    await db
      .update(humanInterviewMeetingInterviewer)
      .set({ joinedAt: NOW })
      .where(eq(humanInterviewMeetingInterviewer.meetingId, meeting.id));
    await db
      .update(humanInterviewMeeting)
      .set({
        recordingStatus: "starting",
        updatedAt: new Date(Date.now() - 3 * 60 * 1000),
      })
      .where(eq(humanInterviewMeeting.id, meeting.id));

    const roomName = meeting.liveKitRoomName ?? "";
    await expect(claimHumanInterviewRecordingStartByRoomName(roomName)).resolves.toMatchObject({
      meetingId: meeting.id,
    });
    await markHumanInterviewRecordingStarted({
      candidateEgressId: "egress-candidate-recovered-from-webhook",
      candidateFileKey: "human-interviews/org/meeting/candidate-audio.ogg",
      egressId: "egress-recovered-from-webhook",
      fileKey: "human-interviews/org/meeting/room-audio.ogg",
      meetingId: meeting.id,
    });

    await expect(
      markHumanInterviewRecordingCompleted({
        durationMs: 30_000,
        egressId: "egress-recovered-from-webhook",
        fileKey: "human-interviews/org/meeting/room-audio.ogg",
        roomName,
        sizeBytes: 1024,
      }),
    ).resolves.toBeNull();
    await expect(
      markHumanInterviewRecordingCompleted({
        durationMs: 30_000,
        egressId: "egress-candidate-recovered-from-webhook",
        fileKey: "human-interviews/org/meeting/candidate-audio.ogg",
        roomName,
        sizeBytes: 512,
      }),
    ).resolves.toMatchObject({ meetingId: meeting.id });

    await markHumanInterviewRecordingFailed({
      egressId: "egress-recovered-from-webhook",
      error: "迟到的启动协程错误",
      meetingId: meeting.id,
    });
    const [recording] = await db
      .select({ recordingStatus: humanInterviewMeeting.recordingStatus })
      .from(humanInterviewMeeting)
      .where(eq(humanInterviewMeeting.id, meeting.id));
    expect(recording?.recordingStatus).toBe("completed");
  });

  it("只有候选人与面试官同时在线时才启动录音，离会后可重新加入", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "在线状态",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        title: "在线状态会议",
      },
      organizationId: ORG,
    });
    const roomName = meeting.liveKitRoomName ?? "";

    await markHumanInterviewParticipantJoined({
      identity: `candidate_${round.id}`,
      roomName,
    });
    await markHumanInterviewParticipantLeft({
      identity: `candidate_${round.id}`,
      roomName,
    });
    await markHumanInterviewParticipantJoined({
      identity: `interviewer_${INTERVIEWER_A}`,
      roomName,
    });

    await expect(claimHumanInterviewRecordingStartByRoomName(roomName)).resolves.toBeNull();

    await markHumanInterviewParticipantJoined({
      identity: `candidate_${round.id}`,
      roomName,
    });
    await expect(claimHumanInterviewRecordingStartByRoomName(roomName)).resolves.toMatchObject({
      meetingId: meeting.id,
    });
  });

  it("保留 AI 原始评价与人工提交评价，并以人工评价作为当前值", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "历史评分",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await db
      .update(humanInterviewRound)
      .set({ score: 88 })
      .where(eq(humanInterviewRound.id, round.id));
    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        roundIds: [round.id],
        scheduledAt: "2026-05-30T10:00:00.000Z",
        title: "历史评分复面",
      },
      organizationId: ORG,
    });
    const meetingSessionId = "meeting_session_historical_score";
    const transcriptRevisionId = "transcript_revision_historical_score";
    await db.insert(meetingSession).values({
      id: meetingSessionId,
      manifestSha256: "a".repeat(64),
      organizationId: ORG,
      ownerId: HR_USER,
      savedAt: NOW,
      startedAt: NOW,
      status: "ready",
      title: "历史评分复面",
      transcriptionStatus: "ready",
    });
    await db.insert(meetingTranscriptRevision).values({
      id: transcriptRevisionId,
      kind: "human",
      meetingId: meetingSessionId,
      model: "manual",
      organizationId: ORG,
      pipelineVersion: "human-v1",
      provider: "human",
      region: "local",
      revision: 1,
      sourceManifestSha256: "a".repeat(64),
    });
    await Promise.all([
      db
        .update(meetingSession)
        .set({ activeTranscriptRevisionId: transcriptRevisionId })
        .where(eq(meetingSession.id, meetingSessionId)),
      db
        .update(humanInterviewMeeting)
        .set({ processingMeetingSessionId: meetingSessionId })
        .where(eq(humanInterviewMeeting.id, meeting.id)),
    ]);

    const aiEvaluation = {
      detailedAnalysis: "AI 完整分析",
      evidenceTurnIds: [],
      overallEvaluation: "AI 整体评价",
      professionalSkill: "良",
      rating: "B" as const,
      risks: "AI 风险",
      rolePosition: "执行者",
      salaryRecommendation: "",
      seniorityPosition: "中级",
      strengths: "AI 优势",
    };
    await db
      .update(humanInterviewRound)
      .set({
        evaluationStatus: "generating",
        evaluationTranscriptRevisionId: transcriptRevisionId,
      })
      .where(eq(humanInterviewRound.id, round.id));
    await expect(
      publishHumanInterviewEvaluation({
        evaluation: aiEvaluation,
        meetingSessionId,
        organizationId: ORG,
        roundId: round.id,
        transcriptRevisionId,
      }),
    ).resolves.toBe(true);

    const humanEvaluation = {
      detailedAnalysis: "人工复核后的完整分析",
      evidenceTurnIds: [],
      overallEvaluation: "人工整体评价",
      professionalSkill: "优",
      rating: "A" as const,
      risks: "人工确认风险",
      rolePosition: "负责人",
      salaryRecommendation: "",
      seniorityPosition: "高级",
      strengths: "人工确认优势",
    };

    await submitHumanInterviewEvaluation({
      actorId: INTERVIEWER_A,
      evaluation: humanEvaluation,
      meetingSessionId,
      organizationId: ORG,
      outcome: "pass",
      roundId: round.id,
      transcriptRevisionId,
    });
    await expect(
      requestHumanInterviewEvaluation({ force: true, meetingSessionId, organizationId: ORG }),
    ).resolves.toBeNull();

    const [submitted] = await db
      .select({
        evaluation: humanInterviewRound.evaluation,
        score: humanInterviewRound.score,
      })
      .from(humanInterviewRound)
      .where(eq(humanInterviewRound.id, round.id));
    expect(submitted?.score).toBe(88);
    expect(submitted?.evaluation).toEqual(humanEvaluation);

    const snapshots = await listHumanInterviewEvaluationSnapshotsForAnalysis({
      organizationId: ORG,
      roundId: round.id,
    });
    expect(snapshots).toMatchObject([
      { evaluation: aiEvaluation, source: "ai_generated" },
      {
        createdBy: INTERVIEWER_A,
        evaluation: humanEvaluation,
        outcome: "pass",
        source: "human_submitted",
      },
    ]);
  });

  it("录音处理耗尽重试次数后不再被恢复任务无限入队", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "处理失败",
        roundKind: "second_interview",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A],
        roundIds: [round.id],
        title: "处理失败会议",
      },
      organizationId: ORG,
    });
    await db
      .update(humanInterviewMeeting)
      .set({
        candidateRecordingDurationMs: 30_000,
        candidateRecordingEgressId: "candidate-egress-terminal-processing-failure",
        candidateRecordingFileKey: "human-interviews/org/meeting/candidate-terminal.ogg",
        candidateRecordingSizeBytes: 512,
        candidateRecordingStatus: "completed",
        recordingDurationMs: 30_000,
        recordingEgressId: "egress-terminal-processing-failure",
        recordingFileKey: "human-interviews/org/meeting/terminal.ogg",
        recordingSizeBytes: 1024,
        recordingStatus: "completed",
      })
      .where(eq(humanInterviewMeeting.id, meeting.id));

    const recoverableBeforeFailure = await listRecoverableHumanInterviewRecordingJobs();
    expect(recoverableBeforeFailure.some((job) => job.meetingId === meeting.id)).toBe(true);

    await saveHumanInterviewRecordingProcessingError({
      error: "对象存储持续不可用",
      meetingId: meeting.id,
      terminal: true,
    });

    const recoverableAfterFailure = await listRecoverableHumanInterviewRecordingJobs();
    expect(recoverableAfterFailure.some((job) => job.meetingId === meeting.id)).toBe(false);
  });
});

describe("offer drafts DAO", () => {
  it("createOfferDraft 自动算 version 并 supersede 旧的 sent 版本", async () => {
    await clearSubtables();
    await resetCandidateStage("offer");

    const v1 = await createOfferDraft({
      input: { baseSalary: 30_000, position: "高级前端" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
      sendImmediately: true,
    });
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("sent");

    // 新建 v2 应该把 v1 supersede。
    const v2 = await createOfferDraft({
      input: { baseSalary: 32_000, position: "高级前端" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
      sendImmediately: true,
    });
    expect(v2.version).toBe(2);

    const drafts = await listOfferDrafts(RECORD_ID, ORG);
    const sortedById = new Map(drafts.map((d) => [d.id, d]));
    expect(sortedById.get(v1.id)?.status).toBe("superseded");
    expect(sortedById.get(v2.id)?.status).toBe("sent");
  });

  it("maybeAdvanceToOffer 验证当前 Offer 节点", async () => {
    await clearSubtables();
    await resetCandidateStage("offer");

    await createOfferDraft({
      input: { baseSalary: 30_000, position: "测试岗" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await maybeAdvanceToOffer(RECORD_ID, ORG);
    const [row] = await db
      .select({ pipelineStage: recruitingRecordReadModel.pipelineStage })
      .from(recruitingRecordReadModel)
      .where(eq(recruitingRecordReadModel.id, RECORD_ID));
    expect(row?.pipelineStage).toBe("offer");
  });

  it("editOfferDraft 仅 draft 时允许；sent 后只能用 respond/cancel", async () => {
    await clearSubtables();
    await resetCandidateStage("offer");
    const draft = await createOfferDraft({
      input: { baseSalary: 25_000, position: "草稿岗" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(draft.status).toBe("draft");

    const edited = await editOfferDraft({
      draftId: draft.id,
      input: { baseSalary: 27_000 },
      organizationId: ORG,
    });
    expect(edited.baseSalary).toBe(27_000);

    await sendOfferDraft(draft.id, ORG);
    await expect(
      editOfferDraft({
        draftId: draft.id,
        input: { baseSalary: 28_000 },
        organizationId: ORG,
      }),
    ).rejects.toBeInstanceOf(OfferDraftError);
  });

  it("respondOfferDraft：accepted/declined 终态化，counter 保持 sent + 记 candidateCounter", async () => {
    await clearSubtables();
    await resetCandidateStage("offer");
    const draft = await createOfferDraft({
      input: { baseSalary: 30_000, position: "议价岗" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
      sendImmediately: true,
    });

    // counter 不改 status。
    const counter = await respondOfferDraft({
      candidateCounter: "希望月薪再加 2k",
      draftId: draft.id,
      organizationId: ORG,
      response: "counter",
    });
    expect(counter.status).toBe("sent");
    expect(counter.candidateCounter).toBe("希望月薪再加 2k");
    expect(counter.responseAt).not.toBeNull();

    // accepted 终态化。
    const accepted = await respondOfferDraft({
      draftId: draft.id,
      organizationId: ORG,
      response: "accepted",
    });
    expect(accepted.status).toBe("accepted");

    // 终态后再 respond 应被拒。
    await expect(
      respondOfferDraft({
        draftId: draft.id,
        organizationId: ORG,
        response: "declined",
      }),
    ).rejects.toBeInstanceOf(OfferDraftError);
  });

  it("cancelOfferDraft：sent → expired；终态版本不可撤回", async () => {
    await clearSubtables();
    await resetCandidateStage("offer");
    const draft = await createOfferDraft({
      input: { baseSalary: 30_000, position: "撤回测试岗" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
      sendImmediately: true,
    });
    const cancelled = await cancelOfferDraft(draft.id, ORG);
    expect(cancelled.status).toBe("expired");

    await expect(cancelOfferDraft(draft.id, ORG)).rejects.toBeInstanceOf(OfferDraftError);
  });
});
