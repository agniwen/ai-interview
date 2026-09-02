// 真人复面单轮 DAO：mutation 事务同步 round 与 interviewer junction；路由层只做权限、校验与调用。

import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { uniq } from "lodash-es";
import { db } from "../../../../../../lib/server/db/index";
import { enqueueHumanMeetingEvents } from "../../../../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../../../../interview-notifications/utils/feature-flags";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type {
  HumanInterviewRoundInput,
  HumanInterviewRoundOutcome,
} from "@arc/db-schema/studio-interviews";
import type { HumanInterviewRoundRecord } from "@arc/shared/studio-pipeline-stages";
import { enqueueHumanInterviewRoundCompletion } from "./human-interview-round-completion";
import {
  COMPLETED_HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE,
  HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE,
  humanInterviewFeedbackSchema,
} from "../utils/human-interview-readiness";
import type { HumanInterviewRoundReadiness } from "../utils/human-interview-readiness";

export type { HumanInterviewRoundRecord };
export {
  COMPLETED_HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE,
  HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE,
  HUMAN_INTERVIEW_READY_FOR_OFFER_REQUIRED_MESSAGE,
  getHumanInterviewOfferReadinessError,
} from "../utils/human-interview-readiness";
export type { HumanInterviewRoundReadiness } from "../utils/human-interview-readiness";

// drizzle 事务 callback 参数类型；和 db 实例签名差一个 $client 字段，需要单独抽出来。
// Inner-transaction type; drops the $client field that's on the top-level db.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const DEFAULT_VALID_DURATION_MS = 60 * 60 * 1000;

type HumanInterviewRoundEditInput = Partial<HumanInterviewRoundInput> & {
  validUntil?: string | null;
};

export class EditRoundError extends Error {
  readonly status: 400 | 404;
  constructor(message: string, status: 400 | 404) {
    super(message);
    this.name = "EditRoundError";
    this.status = status;
  }
}

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizeRequiredFeedback(value: string | null | undefined): string {
  const result = humanInterviewFeedbackSchema.safeParse(value);
  if (!result.success) {
    throw new EditRoundError(
      result.error.issues[0]?.message ?? HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE,
      400,
    );
  }
  return result.data;
}

export async function loadHumanInterviewRoundReadiness(
  interviewRecordId: string,
  organizationId: string,
  executor: Pick<Tx, "select"> = db,
): Promise<HumanInterviewRoundReadiness> {
  const rows = await executor
    .select({
      feedback: studioHumanInterviewRound.feedback,
      status: studioHumanInterviewRound.status,
    })
    .from(studioHumanInterviewRound)
    .where(
      and(
        eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId),
        eq(studioHumanInterviewRound.organizationId, organizationId),
        ne(studioHumanInterviewRound.status, "cancelled"),
      ),
    );

  return {
    completedRoundsMissingFeedback: rows.filter(
      (row) => row.status === "completed" && !row.feedback?.trim(),
    ).length,
    pendingRounds: rows.filter((row) => row.status === "pending").length,
    totalRounds: rows.length,
  };
}

export async function assertCompletedHumanInterviewRoundsHaveFeedback(
  interviewRecordId: string,
  organizationId: string,
): Promise<void> {
  const readiness = await loadHumanInterviewRoundReadiness(interviewRecordId, organizationId);
  if (readiness.completedRoundsMissingFeedback > 0) {
    throw new EditRoundError(COMPLETED_HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE, 400);
  }
}

// 把 query 结果（含 interviewer rows 数组）拍平成 DTO。
// Flatten the joined query result into the DTO shape.
function toRecord(row: {
  round: typeof studioHumanInterviewRound.$inferSelect;
  interviewers: {
    confirmedAt: Date | null;
    confirmedScheduleVersion: number | null;
    declineReason: string | null;
    declinedAt: Date | null;
    image: string | null;
    name: string | null;
    status: typeof studioHumanInterviewRoundInterviewer.$inferSelect.status;
    userId: string;
  }[];
}): HumanInterviewRoundRecord {
  const { round, interviewers } = row;
  return {
    cancelReason: round.cancelReason,
    cancelledAt: serializeDate(round.cancelledAt),
    completedAt: serializeDate(round.completedAt),
    createdAt: serializeDate(round.createdAt) ?? new Date().toISOString(),
    evaluation: round.evaluation,
    evaluationError: round.evaluationError,
    evaluationOverall: round.evaluation?.overallEvaluation ?? null,
    evaluationRating: round.evaluation?.rating ?? null,
    evaluationStatus: round.evaluationStatus,
    evaluationSubmittedAt: serializeDate(round.evaluationSubmittedAt),
    evaluationTranscriptRevisionId: round.evaluationTranscriptRevisionId,
    evaluationUpdatedAt: serializeDate(round.evaluationUpdatedAt),
    evaluationUpdatedBy: round.evaluationUpdatedBy,
    feedback: round.feedback,
    format: round.format,
    id: round.id,
    interviewRecordId: round.interviewRecordId,
    interviewers: interviewers.map((i) => ({
      confirmedAt: serializeDate(i.confirmedAt),
      confirmedScheduleVersion: i.confirmedScheduleVersion,
      declineReason: i.declineReason,
      declinedAt: serializeDate(i.declinedAt),
      id: i.userId,
      image: i.image,
      name: i.name ?? "未命名",
      status: i.status,
    })),
    label: round.label,
    location: round.location,
    meetingUrl: round.meetingUrl,
    notes: round.notes,
    organizationId: round.organizationId,
    outcome: round.outcome,
    scheduledAt: serializeDate(round.scheduledAt),
    score: round.score,
    sortOrder: round.sortOrder,
    status: round.status,
    updatedAt: serializeDate(round.updatedAt) ?? new Date().toISOString(),
  };
}

// 列出某候选人所有轮次（含 cancelled，按 sortOrder asc）。
// List all rounds (including cancelled) for a candidate, sortOrder asc.
export async function listHumanInterviewRounds(
  interviewRecordId: string,
  organizationId: string,
): Promise<HumanInterviewRoundRecord[]> {
  const rounds = await db
    .select()
    .from(studioHumanInterviewRound)
    .where(
      and(
        eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId),
        eq(studioHumanInterviewRound.organizationId, organizationId),
      ),
    )
    .orderBy(asc(studioHumanInterviewRound.sortOrder));
  if (rounds.length === 0) {
    return [];
  }
  const roundIds = rounds.map((r) => r.id);
  // 拉所有 junction + 关联的 user 信息。
  // Fetch junction rows + linked user info in one query.
  const interviewerRows = await db
    .select({
      confirmedAt: studioHumanInterviewRoundInterviewer.confirmedAt,
      confirmedScheduleVersion: studioHumanInterviewRoundInterviewer.confirmedScheduleVersion,
      declineReason: studioHumanInterviewRoundInterviewer.declineReason,
      declinedAt: studioHumanInterviewRoundInterviewer.declinedAt,
      image: user.image,
      name: user.name,
      roundId: studioHumanInterviewRoundInterviewer.roundId,
      status: studioHumanInterviewRoundInterviewer.status,
      userId: user.id,
    })
    .from(studioHumanInterviewRoundInterviewer)
    .innerJoin(user, eq(studioHumanInterviewRoundInterviewer.userId, user.id))
    .where(inArray(studioHumanInterviewRoundInterviewer.roundId, roundIds));
  const byRound = new Map<string, (typeof interviewerRows)[number][]>();
  for (const ir of interviewerRows) {
    const list = byRound.get(ir.roundId) ?? [];
    list.push(ir);
    byRound.set(ir.roundId, list);
  }
  return rounds.map((round) => toRecord({ interviewers: byRound.get(round.id) ?? [], round }));
}

// 候选人下一个可用的 sortOrder：max(existing) + 1，没有时返回 0。
// 包含 cancelled 的轮次，避免取消后新轮和旧轮重号引起列表错乱。
// Next available sortOrder; counts cancelled rounds too so re-creating after
// a cancel doesn't collide with the cancelled row.
async function nextSortOrder(tx: Tx, interviewRecordId: string): Promise<number> {
  const [row] = await tx
    .select({ sortOrder: studioHumanInterviewRound.sortOrder })
    .from(studioHumanInterviewRound)
    .where(eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId))
    .orderBy(desc(studioHumanInterviewRound.sortOrder))
    .limit(1);
  return row ? row.sortOrder + 1 : 0;
}

export interface CreateRoundOptions {
  interviewRecordId: string;
  organizationId: string;
  input: HumanInterviewRoundInput;
}

async function assertCanCreateHumanInterviewRound(
  tx: Tx,
  interviewRecordId: string,
  organizationId: string,
): Promise<void> {
  const [candidate] = await tx
    .select({ id: studioInterview.id })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.id, interviewRecordId),
        eq(studioInterview.organizationId, organizationId),
      ),
    )
    .for("update")
    .limit(1);
  if (!candidate) {
    throw new EditRoundError("候选人记录不存在。", 404);
  }

  const existingRounds = await tx
    .select({
      feedback: studioHumanInterviewRound.feedback,
      label: studioHumanInterviewRound.label,
      outcome: studioHumanInterviewRound.outcome,
      status: studioHumanInterviewRound.status,
    })
    .from(studioHumanInterviewRound)
    .where(
      and(
        eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId),
        eq(studioHumanInterviewRound.organizationId, organizationId),
        ne(studioHumanInterviewRound.status, "cancelled"),
      ),
    )
    .orderBy(desc(studioHumanInterviewRound.sortOrder));

  const pendingRound = existingRounds.find((round) => round.status === "pending");
  if (pendingRound) {
    throw new EditRoundError(
      `请先结束并标记完成“${pendingRound.label}”，再安排下一轮真人面试。`,
      400,
    );
  }
  const completedWithoutFeedback = existingRounds.find(
    (round) => round.status === "completed" && !round.feedback?.trim(),
  );
  if (completedWithoutFeedback) {
    throw new EditRoundError(COMPLETED_HUMAN_INTERVIEW_FEEDBACK_REQUIRED_MESSAGE, 400);
  }
  const [latestCompletedRound] = existingRounds;
  if (latestCompletedRound?.status === "completed" && latestCompletedRound.outcome !== "pass") {
    const resultLabel = latestCompletedRound.outcome === "fail" ? "未通过" : "待定";
    throw new EditRoundError(
      `“${latestCompletedRound.label}”的结果为${resultLabel}，只有标记为通过后才能安排下一轮真人面试。`,
      400,
    );
  }
}

// 加载单条详情（含 interviewers）。
// Load a single round (with interviewers).
export async function loadRoundById(
  roundId: string,
  organizationId: string,
): Promise<HumanInterviewRoundRecord | null> {
  const [round] = await db
    .select()
    .from(studioHumanInterviewRound)
    .where(
      and(
        eq(studioHumanInterviewRound.id, roundId),
        eq(studioHumanInterviewRound.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!round) {
    return null;
  }
  const interviewerRows = await db
    .select({
      confirmedAt: studioHumanInterviewRoundInterviewer.confirmedAt,
      confirmedScheduleVersion: studioHumanInterviewRoundInterviewer.confirmedScheduleVersion,
      declineReason: studioHumanInterviewRoundInterviewer.declineReason,
      declinedAt: studioHumanInterviewRoundInterviewer.declinedAt,
      image: user.image,
      name: user.name,
      status: studioHumanInterviewRoundInterviewer.status,
      userId: user.id,
    })
    .from(studioHumanInterviewRoundInterviewer)
    .innerJoin(user, eq(studioHumanInterviewRoundInterviewer.userId, user.id))
    .where(eq(studioHumanInterviewRoundInterviewer.roundId, roundId));
  return toRecord({
    interviewers: interviewerRows,
    round,
  });
}

// 新建一轮：写 round 行 + interviewer junction。sortOrder 不强制由 input 决定，
// 让 DAO 自动算下一个空位，避免前端传错号撞主键。
//
// Create a round + its interviewer junction rows. sortOrder is server-side
// derived so the client can't collide with existing rows.
export async function createHumanInterviewRound({
  interviewRecordId,
  organizationId,
  input,
}: CreateRoundOptions): Promise<HumanInterviewRoundRecord> {
  const id = crypto.randomUUID();
  const now = new Date();
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

  await db.transaction(async (tx) => {
    await assertCanCreateHumanInterviewRound(tx, interviewRecordId, organizationId);
    const sortOrder = input.sortOrder ?? (await nextSortOrder(tx, interviewRecordId));
    await tx.insert(studioHumanInterviewRound).values({
      createdAt: now,
      feedback: input.feedback ?? null,
      format: input.format,
      id,
      interviewRecordId,
      label: input.label,
      location: input.location ?? null,
      meetingUrl: input.meetingUrl ?? null,
      notes: input.notes ?? null,
      organizationId,
      outcome: input.outcome ?? null,
      scheduledAt,
      score: null,
      sortOrder,
      status: "pending",
      updatedAt: now,
    });
    if (input.interviewerIds.length > 0) {
      await tx.insert(studioHumanInterviewRoundInterviewer).values(
        input.interviewerIds.map((userId) => ({
          roundId: id,
          userId,
        })),
      );
    }
  });

  const created = await loadRoundById(id, organizationId);
  if (!created) {
    throw new Error("创建轮次后查询失败");
  }
  return created;
}

// 编辑轮次：根据 status 决定可写字段。
//   pending：所有字段都能改（label / 时间 / 面试官 / 形式 / 地点 / 备注）
//   completed：只允许改 feedback
//   cancelled：不允许改
//
// Editable fields depend on status. pending = anything; completed = feedback
// only; cancelled = nothing.
export interface EditRoundOptions {
  roundId: string;
  organizationId: string;
  input: HumanInterviewRoundEditInput;
}

function resolveScheduledAtInput(
  value: string | null | undefined,
  fallback: Date | null,
): Date | null {
  if (value === undefined) {
    return fallback;
  }
  if (!value) {
    return null;
  }
  return new Date(value);
}

function resolveValidUntilInput({
  scheduledAt,
  validUntil,
  existingValidUntil,
}: {
  scheduledAt: Date | null;
  validUntil: string | null | undefined;
  existingValidUntil: Date | null;
}): Date | null {
  if (!scheduledAt) {
    return null;
  }

  let resolved: Date;
  if (validUntil === undefined) {
    resolved =
      existingValidUntil && existingValidUntil.getTime() > scheduledAt.getTime()
        ? existingValidUntil
        : new Date(scheduledAt.getTime() + DEFAULT_VALID_DURATION_MS);
  } else if (validUntil) {
    resolved = new Date(validUntil);
  } else {
    resolved = new Date(scheduledAt.getTime() + DEFAULT_VALID_DURATION_MS);
  }

  if (Number.isNaN(resolved.getTime())) {
    throw new EditRoundError("请输入有效的有效时间至", 400);
  }
  if (resolved.getTime() <= scheduledAt.getTime()) {
    throw new EditRoundError("有效时间至必须晚于面试时间", 400);
  }
  return resolved;
}

async function syncLinkedScheduledMeetingWindow({
  tx,
  roundId,
  organizationId,
  scheduledAt,
  validUntil,
  now,
}: {
  tx: Tx;
  roundId: string;
  organizationId: string;
  scheduledAt: Date | null;
  validUntil: string | null | undefined;
  now: Date;
}) {
  const linkedMeetings = await tx
    .select({
      id: studioHumanInterviewMeeting.id,
      status: studioHumanInterviewMeeting.status,
      validUntil: studioHumanInterviewMeeting.validUntil,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
    )
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.roundId, roundId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
      ),
    );

  if (linkedMeetings.some((meeting) => meeting.status !== "scheduled")) {
    throw new EditRoundError("已开始、已结束或已取消的会议不能调整时间", 400);
  }

  const meetingIds = uniq(linkedMeetings.map((meeting) => meeting.id));
  if (meetingIds.length === 0) {
    return;
  }

  const nextValidUntil = resolveValidUntilInput({
    existingValidUntil: linkedMeetings[0]?.validUntil ?? null,
    scheduledAt,
    validUntil,
  });
  await tx
    .update(studioHumanInterviewMeeting)
    .set({ scheduledAt, updatedAt: now, validUntil: nextValidUntil })
    .where(
      and(
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
        inArray(studioHumanInterviewMeeting.id, meetingIds),
      ),
    );
}

export async function editHumanInterviewRound({
  roundId,
  organizationId,
  input,
}: EditRoundOptions): Promise<HumanInterviewRoundRecord> {
  const now = new Date();

  // 事务 + FOR UPDATE：读 existing → 校验 status → 计算 merge → 写。
  // 防止两个 HR 同时编辑同一轮次时 (input ?? existing) merge 互相覆盖。
  // Transaction + FOR UPDATE: serialize read → validate → merge → write so
  // concurrent HR edits can't lose each other's writes.
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(studioHumanInterviewRound)
      .where(
        and(
          eq(studioHumanInterviewRound.id, roundId),
          eq(studioHumanInterviewRound.organizationId, organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!existing) {
      throw new EditRoundError("轮次不存在", 404);
    }
    if (existing.status === "cancelled") {
      throw new EditRoundError("已取消的轮次无法编辑", 400);
    }

    if (existing.status === "completed") {
      // completed：只允许修订 feedback。
      // completed → feedback only.
      const feedback = normalizeRequiredFeedback(input.feedback ?? existing.feedback);
      await tx
        .update(studioHumanInterviewRound)
        .set({
          feedback,
          updatedAt: now,
        })
        .where(eq(studioHumanInterviewRound.id, roundId));
      return;
    }

    // pending：除 status / outcome / completedAt 外都能改；interviewers 全量替换。
    // pending → most fields editable; interviewer set replaced wholesale.
    // input.scheduledAt（string）→ Date；未传才保留 existing，传 null/"" 表示清空。
    // input.scheduledAt (string) → Date; undefined preserves existing,
    // null/"" clears it.
    const nextScheduledAt = resolveScheduledAtInput(input.scheduledAt, existing.scheduledAt);
    if (input.scheduledAt !== undefined || input.validUntil !== undefined) {
      await syncLinkedScheduledMeetingWindow({
        now,
        organizationId,
        roundId,
        scheduledAt: nextScheduledAt,
        tx,
        validUntil: input.validUntil,
      });
    }
    await tx
      .update(studioHumanInterviewRound)
      .set({
        feedback: input.feedback ?? existing.feedback,
        format: input.format ?? existing.format,
        label: input.label ?? existing.label,
        location: input.location ?? existing.location,
        meetingUrl: input.meetingUrl ?? existing.meetingUrl,
        notes: input.notes ?? existing.notes,
        scheduledAt: nextScheduledAt,
        updatedAt: now,
      })
      .where(eq(studioHumanInterviewRound.id, roundId));

    if (input.interviewerIds && input.interviewerIds.length > 0) {
      await tx
        .delete(studioHumanInterviewRoundInterviewer)
        .where(eq(studioHumanInterviewRoundInterviewer.roundId, roundId));
      await tx
        .insert(studioHumanInterviewRoundInterviewer)
        .values(input.interviewerIds.map((userId) => ({ roundId, userId })));
    }
  });

  const updated = await loadRoundById(roundId, organizationId);
  if (!updated) {
    throw new Error("更新后查询失败");
  }
  return updated;
}

// 标记完成：仅 pending → completed；带 outcome / feedback，不再维护数字评分。
// Mark a pending round as completed; numeric scoring is retired.
export interface CompleteRoundOptions {
  actorUserId?: string | null;
  roundId: string;
  organizationId: string;
  outcome: HumanInterviewRoundOutcome;
  feedback?: string | null;
}
export async function completeHumanInterviewRound({
  actorUserId = null,
  roundId,
  organizationId,
  outcome,
  feedback,
}: CompleteRoundOptions): Promise<HumanInterviewRoundRecord> {
  const nextFeedback = normalizeRequiredFeedback(feedback);
  const existing = await loadRoundById(roundId, organizationId);
  if (!existing) {
    throw new EditRoundError("轮次不存在", 404);
  }
  if (existing.status !== "pending") {
    throw new EditRoundError("只有 pending 状态的轮次可以标记完成", 400);
  }
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(studioHumanInterviewRound)
      .set({
        completedAt: now,
        feedback: nextFeedback,
        outcome,
        score: null,
        status: "completed",
        updatedAt: now,
      })
      .where(eq(studioHumanInterviewRound.id, roundId));
    await enqueueHumanInterviewRoundCompletion(tx, {
      actorUserId,
      now,
      organizationId,
      roundId,
    });
  });
  const updated = await loadRoundById(roundId, organizationId);
  if (!updated) {
    throw new Error("更新后查询失败");
  }
  return updated;
}

// 取消：pending → cancelled。已完成轮次不可取消（避免改写历史）。
// Cancel a pending round; completed rounds are immutable.
export interface CancelRoundOptions {
  actorUserId?: string | null;
  roundId: string;
  organizationId: string;
  reason?: string | null;
}

export interface CancelRoundResult {
  round: HumanInterviewRoundRecord;
  deletedLiveKitRoomNames: (string | null)[];
}

export async function cancelHumanInterviewRoundWithMeetings({
  actorUserId = null,
  roundId,
  organizationId,
  reason,
}: CancelRoundOptions): Promise<CancelRoundResult> {
  const existing = await loadRoundById(roundId, organizationId);
  if (!existing) {
    throw new EditRoundError("轮次不存在", 404);
  }
  if (existing.status !== "pending") {
    throw new EditRoundError("只有 pending 状态的轮次可以取消", 400);
  }
  const now = new Date();
  const deletedLiveKitRoomNames: (string | null)[] = [];
  await db.transaction(async (tx) => {
    const meetingRows = await tx
      .select({
        id: studioHumanInterviewMeeting.id,
        liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
        scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
        status: studioHumanInterviewMeeting.status,
      })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewMeeting,
        eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
      )
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.roundId, roundId),
          eq(studioHumanInterviewMeeting.organizationId, organizationId),
        ),
      );
    if (meetingRows.some((meeting) => meeting.status === "in_progress")) {
      throw new EditRoundError("进行中的会议不能取消，请先结束会议。", 400);
    }

    const meetingIds = uniq(meetingRows.map((meeting) => meeting.id));
    deletedLiveKitRoomNames.push(...uniq(meetingRows.map((meeting) => meeting.liveKitRoomName)));
    if (meetingIds.length > 0) {
      await tx
        .update(studioHumanInterviewMeeting)
        .set({
          cancelledAt: now,
          lifecycleOccurredAt: now,
          lifecycleSource: "manual",
          status: "cancelled",
          updatedAt: now,
        })
        .where(
          and(
            eq(studioHumanInterviewMeeting.organizationId, organizationId),
            inArray(studioHumanInterviewMeeting.id, meetingIds),
          ),
        );
      if (isInterviewNotificationFlowEnabled()) {
        for (const meeting of meetingRows) {
          await enqueueHumanMeetingEvents(tx, {
            actorUserId,
            changeReason: reason,
            meetingId: meeting.id,
            now,
            scheduleVersion: meeting.scheduleVersion,
            type: "human_interview_cancelled",
          });
        }
      }
    }

    await tx
      .update(studioHumanInterviewRound)
      .set({
        cancelReason: reason ?? null,
        cancelledAt: now,
        status: "cancelled",
        updatedAt: now,
      })
      .where(
        and(
          eq(studioHumanInterviewRound.id, roundId),
          eq(studioHumanInterviewRound.organizationId, organizationId),
        ),
      );
  });
  const updated = await loadRoundById(roundId, organizationId);
  if (!updated) {
    throw new Error("更新后查询失败");
  }
  return { deletedLiveKitRoomNames, round: updated };
}

export async function cancelHumanInterviewRound(
  options: CancelRoundOptions,
): Promise<HumanInterviewRoundRecord> {
  const result = await cancelHumanInterviewRoundWithMeetings(options);
  return result.round;
}

// 候选人 pipelineStage 自动推进：仅在创建第一轮时触发。
// 「第一轮」= 该候选人在 round 表里第一次出现非 cancelled 行。
// 守卫：只在 screening/ai_interview/written_test 三个阶段往前推；
//      已经在 human_interview 之后（offer/closed）就不动。
//
// Auto-advance pipelineStage when creating the candidate's first round.
// Only nudges forward from screening/written_test/ai_interview; never moves
// backwards from offer/closed.
export async function maybeAdvanceToHumanInterview(
  interviewRecordId: string,
  organizationId: string,
): Promise<void> {
  // 统计非 cancelled 行数 —— 这次插入完后，count=1 说明刚刚是第一轮。
  // First non-cancelled row count; 1 means we just inserted the first round.
  const rounds = await db
    .select({ id: studioHumanInterviewRound.id })
    .from(studioHumanInterviewRound)
    .where(
      and(
        eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId),
        eq(studioHumanInterviewRound.organizationId, organizationId),
      ),
    )
    .limit(2);
  if (rounds.length !== 1) {
    return;
  }
  // 单条 UPDATE 自带 WHERE 守卫：只在可推进的阶段 + 仍 in_pipeline 时才命中。
  // 这样 race（另一个 HR 同时把候选人结束）不会触发 CHECK 约束，而是 no-op。
  // Single UPDATE guarded by WHERE: only fires when the candidate is still in
  // an advanceable stage and active. A concurrent close becomes a no-op instead
  // of violating the (pipeline_stage='closed' ⇔ outcome ≠ 'in_pipeline') CHECK.
  await db
    .update(studioInterview)
    .set({ pipelineStage: "human_interview", updatedAt: new Date() })
    .where(
      and(
        eq(studioInterview.id, interviewRecordId),
        eq(studioInterview.organizationId, organizationId),
        inArray(studioInterview.pipelineStage, ["screening", "written_test", "ai_interview"]),
        eq(studioInterview.outcome, "in_pipeline"),
      ),
    );
}
