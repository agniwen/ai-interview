// 真人复面 + Offer 子表 DAO 的集成测试。覆盖：
//   1. 真人复面：create（自动 advance pipelineStage）→ complete → cancel；status 守卫
//   2. Offer：create（auto-supersede 旧 sent 版本）→ patch（仅 draft 时）→ send → respond
//   3. respond=accepted 后不再允许编辑，cancel 把 sent → expired
//
// Integration tests for human-interview + offer subtable DAOs.

import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  member,
  organization,
  studioHumanInterviewMeeting,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  studioOfferDraft,
  user,
} from "@arc/db-schema/schema";
import {
  cancelHumanInterviewRound,
  completeHumanInterviewRound,
  createHumanInterviewRound,
  editHumanInterviewRound,
  EditRoundError,
  listHumanInterviewRounds,
  maybeAdvanceToHumanInterview,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-rounds";
import {
  createHumanInterviewMeeting,
  endHumanInterviewMeetingsByRound,
  HumanInterviewMeetingError,
  isHumanInterviewMeetingAfterValidUntil,
  listHumanInterviewMeetings,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-meetings";
import {
  cancelOfferDraft,
  createOfferDraft,
  editOfferDraft,
  listOfferDrafts,
  maybeAdvanceToOffer,
  OfferDraftError,
  respondOfferDraft,
  sendOfferDraft,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/offer-drafts";

const ORG = "test_org_pipeline_subtables";
const HR_USER = "test_user_pipeline_hr";
const INTERVIEWER_A = "test_user_pipeline_int_a";
const INTERVIEWER_B = "test_user_pipeline_int_b";
const RECORD_ID = "ri_pipeline_subtables_1";
const RECORD_ID_B = "ri_pipeline_subtables_2";
const NOW = new Date("2026-05-22T08:00:00.000Z");

async function cleanup() {
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG));
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
  await db.insert(member).values({
    createdAt: NOW,
    id: "m_pipeline_hr",
    organizationId: ORG,
    role: "owner",
    userId: HR_USER,
  });
  await db.insert(studioInterview).values([
    {
      candidateName: "复面测试",
      createdAt: NOW,
      createdBy: HR_USER,
      id: RECORD_ID,
      interviewQuestions: [],
      organizationId: ORG,
      pipelineStage: "ai_interview",
      status: "completed",
      updatedAt: NOW,
    },
    {
      candidateName: "群面候选人",
      createdAt: NOW,
      createdBy: HR_USER,
      id: RECORD_ID_B,
      interviewQuestions: [],
      organizationId: ORG,
      pipelineStage: "human_interview",
      status: "completed",
      updatedAt: NOW,
    },
  ]);
});

afterAll(async () => {
  await cleanup();
});

async function resetCandidateStage(stage: "ai_interview" | "human_interview" | "offer") {
  await db
    .update(studioInterview)
    .set({ pipelineStage: stage, updatedAt: new Date() })
    .where(eq(studioInterview.id, RECORD_ID));
}

async function clearSubtables() {
  await db
    .delete(studioHumanInterviewMeeting)
    .where(eq(studioHumanInterviewMeeting.organizationId, ORG));
  await db
    .delete(studioHumanInterviewRoundInterviewer)
    .where(
      sql`round_id IN (SELECT id FROM studio_human_interview_round WHERE organization_id = ${ORG})`,
    );
  await db
    .delete(studioHumanInterviewRound)
    .where(eq(studioHumanInterviewRound.organizationId, ORG));
  await db.delete(studioOfferDraft).where(eq(studioOfferDraft.interviewRecordId, RECORD_ID));
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
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(round1.sortOrder).toBe(0);
    expect(round1.interviewers.map((i) => i.id)).toEqual([INTERVIEWER_A]);

    const round2 = await createHumanInterviewRound({
      input: {
        format: "onsite",
        interviewerIds: [INTERVIEWER_A, INTERVIEWER_B],
        label: "HR 复面",
        location: "上海办公室",
      },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    expect(round2.sortOrder).toBe(1);
    expect(round2.interviewers).toHaveLength(2);
  });

  it("maybeAdvanceToHumanInterview 仅在「第一轮」+「可推进阶段」时生效", async () => {
    await clearSubtables();
    await resetCandidateStage("ai_interview");

    // 创建第一轮后调用应推进。Auto-advance triggers after first round.
    await createHumanInterviewRound({
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "首轮" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await maybeAdvanceToHumanInterview(RECORD_ID, ORG);
    let [row] = await db
      .select({ pipelineStage: studioInterview.pipelineStage })
      .from(studioInterview)
      .where(eq(studioInterview.id, RECORD_ID));
    expect(row?.pipelineStage).toBe("human_interview");

    // 已经在 human_interview 后，再调一次应该 no-op（不会倒退也不会重复跳）。
    // Re-running should be a no-op once we're already at human_interview or later.
    await resetCandidateStage("offer");
    await createHumanInterviewRound({
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "第 2 轮" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await maybeAdvanceToHumanInterview(RECORD_ID, ORG);
    [row] = await db
      .select({ pipelineStage: studioInterview.pipelineStage })
      .from(studioInterview)
      .where(eq(studioInterview.id, RECORD_ID));
    // offer 不能被倒退到 human_interview；advance 应跳过。
    expect(row?.pipelineStage).toBe("offer");
  });

  it("completeHumanInterviewRound 写 outcome + score + feedback；非 pending 拒绝", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: { format: "phone", interviewerIds: [INTERVIEWER_A], label: "电话面" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const completed = await completeHumanInterviewRound({
      feedback: "技术扎实",
      organizationId: ORG,
      outcome: "pass",
      roundId: round.id,
      score: 88,
    });
    expect(completed.status).toBe("completed");
    expect(completed.outcome).toBe("pass");
    expect(completed.score).toBe(88);
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
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "可取消轮" },
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
    await expect(
      listHumanInterviewMeetings({ interviewRecordId: RECORD_ID, organizationId: ORG }),
    ).resolves.toEqual([]);

    // 完成轮：再 cancel 应 400。
    const round2 = await createHumanInterviewRound({
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "已完成轮" },
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
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "1" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const r2 = await createHumanInterviewRound({
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "2" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await cancelHumanInterviewRound({ organizationId: ORG, roundId: r1.id });

    const list = await listHumanInterviewRounds(RECORD_ID, ORG);
    expect(list.map((r) => r.id)).toEqual([r1.id, r2.id]);
    expect(list[0]?.status).toBe("cancelled");
    expect(list[1]?.status).toBe("pending");
  });

  it("editHumanInterviewRound 同步 scheduled 会议时间，已结束会议拒绝调整", async () => {
    await clearSubtables();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [INTERVIEWER_A],
        label: "可改时间",
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
  it("createHumanInterviewMeeting 关联多个候选人轮次和多个面试官", async () => {
    await clearSubtables();

    const roundA = await createHumanInterviewRound({
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "技术复面" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    const roundB = await createHumanInterviewRound({
      input: { format: "online", interviewerIds: [INTERVIEWER_B], label: "技术复面" },
      interviewRecordId: RECORD_ID_B,
      organizationId: ORG,
    });

    const meeting = await createHumanInterviewMeeting({
      createdBy: HR_USER,
      input: {
        interviewerIds: [INTERVIEWER_A, INTERVIEWER_B],
        roundIds: [roundA.id, roundB.id],
        scheduledAt: "2026-05-30T10:00:00.000Z",
        title: "技术群面",
      },
      organizationId: ORG,
    });

    expect(meeting.liveKitRoomName).toMatch(/^human_/);
    expect(meeting.rounds.map((r) => r.interviewRecordId).toSorted()).toEqual(
      [RECORD_ID, RECORD_ID_B].toSorted(),
    );
    expect(meeting.interviewers.map((i) => i.id).toSorted()).toEqual(
      [INTERVIEWER_A, INTERVIEWER_B].toSorted(),
    );
    expect(meeting.interviewers.find((i) => i.id === INTERVIEWER_A)?.role).toBe("host");
    expect(meeting.validUntil).toBe("2026-05-30T11:00:00.000Z");

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
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "技术复面" },
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
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "HR 复面" },
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
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "已完成" },
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
      input: { format: "online", interviewerIds: [INTERVIEWER_A], label: "技术复面" },
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
});

describe("offer drafts DAO", () => {
  it("createOfferDraft 自动算 version 并 supersede 旧的 sent 版本", async () => {
    await clearSubtables();
    await resetCandidateStage("human_interview");

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

  it("maybeAdvanceToOffer 仅在第一版 + 早期阶段时生效", async () => {
    await clearSubtables();
    await resetCandidateStage("human_interview");
    await createOfferDraft({
      input: { baseSalary: 30_000, position: "测试岗" },
      interviewRecordId: RECORD_ID,
      organizationId: ORG,
    });
    await maybeAdvanceToOffer(RECORD_ID, ORG);
    const [row] = await db
      .select({ pipelineStage: studioInterview.pipelineStage })
      .from(studioInterview)
      .where(eq(studioInterview.id, RECORD_ID));
    expect(row?.pipelineStage).toBe("offer");
  });

  it("editOfferDraft 仅 draft 时允许；sent 后只能用 respond/cancel", async () => {
    await clearSubtables();
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
