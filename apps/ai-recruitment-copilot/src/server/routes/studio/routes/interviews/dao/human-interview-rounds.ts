import "server-only";

// 真人复面单轮 DAO。每个 mutation 都是一个事务，确保 round 与 interviewer junction 同步。
// 路由层只负责权限 + 输入校验 + 调用这里的函数。
//
// Human-interview round DAO. Each mutation runs in a single transaction so the
// round row and its interviewer junction stay consistent. Route handlers do
// auth + zod validation, then call into these helpers.

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import {
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type {
  HumanInterviewRoundInput,
  HumanInterviewRoundOutcome,
} from "@arc/db-schema/studio-interviews";
import type { HumanInterviewRoundRecord } from "@/lib/shared/studio-pipeline-stages";

export type { HumanInterviewRoundRecord };

// drizzle 事务 callback 参数类型；和 db 实例签名差一个 $client 字段，需要单独抽出来。
// Inner-transaction type; drops the $client field that's on the top-level db.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

// 把 query 结果（含 interviewer rows 数组）拍平成 DTO。
// Flatten the joined query result into the DTO shape.
function toRecord(row: {
  round: typeof studioHumanInterviewRound.$inferSelect;
  interviewers: { id: string; name: string | null; image: string | null }[];
}): HumanInterviewRoundRecord {
  const { round, interviewers } = row;
  return {
    cancelReason: round.cancelReason,
    cancelledAt: serializeDate(round.cancelledAt),
    completedAt: serializeDate(round.completedAt),
    createdAt: serializeDate(round.createdAt) ?? new Date().toISOString(),
    feedback: round.feedback,
    format: round.format,
    id: round.id,
    interviewRecordId: round.interviewRecordId,
    interviewers: interviewers.map((i) => ({
      id: i.id,
      image: i.image,
      name: i.name ?? "未命名",
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
      image: user.image,
      name: user.name,
      roundId: studioHumanInterviewRoundInterviewer.roundId,
      userId: user.id,
    })
    .from(studioHumanInterviewRoundInterviewer)
    .innerJoin(user, eq(studioHumanInterviewRoundInterviewer.userId, user.id))
    .where(inArray(studioHumanInterviewRoundInterviewer.roundId, roundIds));
  const byRound = new Map<string, { id: string; name: string | null; image: string | null }[]>();
  for (const ir of interviewerRows) {
    const list = byRound.get(ir.roundId) ?? [];
    list.push({ id: ir.userId, image: ir.image, name: ir.name });
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
    .select({ image: user.image, name: user.name, userId: user.id })
    .from(studioHumanInterviewRoundInterviewer)
    .innerJoin(user, eq(studioHumanInterviewRoundInterviewer.userId, user.id))
    .where(eq(studioHumanInterviewRoundInterviewer.roundId, roundId));
  return toRecord({
    interviewers: interviewerRows.map((i) => ({ id: i.userId, image: i.image, name: i.name })),
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
      score: input.score ?? null,
      sortOrder,
      status: "pending",
      updatedAt: now,
    });
    await tx.insert(studioHumanInterviewRoundInterviewer).values(
      input.interviewerIds.map((userId) => ({
        roundId: id,
        userId,
      })),
    );
  });

  const created = await loadRoundById(id, organizationId);
  if (!created) {
    throw new Error("创建轮次后查询失败");
  }
  return created;
}

// 编辑轮次：根据 status 决定可写字段。
//   pending：所有字段都能改（label / 时间 / 面试官 / 形式 / 地点 / 备注）
//   completed：只允许改 feedback / score（如果想纠正评分）
//   cancelled：不允许改
//
// Editable fields depend on status. pending = anything; completed = feedback +
// score only; cancelled = nothing.
export interface EditRoundOptions {
  roundId: string;
  organizationId: string;
  input: Partial<HumanInterviewRoundInput>;
}

export class EditRoundError extends Error {
  readonly status: 400 | 404;
  constructor(message: string, status: 400 | 404) {
    super(message);
    this.name = "EditRoundError";
    this.status = status;
  }
}

export async function editHumanInterviewRound({
  roundId,
  organizationId,
  input,
}: EditRoundOptions): Promise<HumanInterviewRoundRecord> {
  const existing = await loadRoundById(roundId, organizationId);
  if (!existing) {
    throw new EditRoundError("轮次不存在", 404);
  }
  if (existing.status === "cancelled") {
    throw new EditRoundError("已取消的轮次无法编辑", 400);
  }

  const now = new Date();
  // 把 input.scheduledAt（string）解析成 Date；input 没传时退回 existing 的值。
  // existing.scheduledAt 在 DTO 里是 ISO 字符串，所以也要 new Date 一次。
  // Resolve scheduledAt with fallback to existing; both are stringified upstream.
  const resolveScheduledAt = (): Date | null => {
    if (input.scheduledAt) {
      return new Date(input.scheduledAt);
    }
    return existing.scheduledAt ? new Date(existing.scheduledAt) : null;
  };
  await db.transaction(async (tx) => {
    if (existing.status === "completed") {
      // completed：只允许修订 feedback / score。
      // completed → feedback + score only.
      await tx
        .update(studioHumanInterviewRound)
        .set({
          feedback: input.feedback ?? existing.feedback,
          score: input.score ?? existing.score,
          updatedAt: now,
        })
        .where(eq(studioHumanInterviewRound.id, roundId));
      return;
    }

    // pending：除 status / outcome / completedAt 外都能改；interviewers 全量替换。
    // pending → most fields editable; interviewer set replaced wholesale.
    await tx
      .update(studioHumanInterviewRound)
      .set({
        feedback: input.feedback ?? existing.feedback,
        format: input.format ?? existing.format,
        label: input.label ?? existing.label,
        location: input.location ?? existing.location,
        meetingUrl: input.meetingUrl ?? existing.meetingUrl,
        notes: input.notes ?? existing.notes,
        scheduledAt: resolveScheduledAt(),
        score: input.score ?? existing.score,
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

// 标记完成：仅 pending → completed；带 outcome / 可选 score / feedback。
// Mark a pending round as completed; outcome required, score/feedback optional.
export interface CompleteRoundOptions {
  roundId: string;
  organizationId: string;
  outcome: HumanInterviewRoundOutcome;
  score?: number | null;
  feedback?: string | null;
}

export async function completeHumanInterviewRound({
  roundId,
  organizationId,
  outcome,
  score,
  feedback,
}: CompleteRoundOptions): Promise<HumanInterviewRoundRecord> {
  const existing = await loadRoundById(roundId, organizationId);
  if (!existing) {
    throw new EditRoundError("轮次不存在", 404);
  }
  if (existing.status !== "pending") {
    throw new EditRoundError("只有 pending 状态的轮次可以标记完成", 400);
  }
  const now = new Date();
  await db
    .update(studioHumanInterviewRound)
    .set({
      completedAt: now,
      feedback: feedback ?? null,
      outcome,
      score: score ?? null,
      status: "completed",
      updatedAt: now,
    })
    .where(eq(studioHumanInterviewRound.id, roundId));
  const updated = await loadRoundById(roundId, organizationId);
  if (!updated) {
    throw new Error("更新后查询失败");
  }
  return updated;
}

// 取消：pending → cancelled。已完成轮次不可取消（避免改写历史）。
// Cancel a pending round; completed rounds are immutable.
export interface CancelRoundOptions {
  roundId: string;
  organizationId: string;
  reason?: string | null;
}

export async function cancelHumanInterviewRound({
  roundId,
  organizationId,
  reason,
}: CancelRoundOptions): Promise<HumanInterviewRoundRecord> {
  const existing = await loadRoundById(roundId, organizationId);
  if (!existing) {
    throw new EditRoundError("轮次不存在", 404);
  }
  if (existing.status !== "pending") {
    throw new EditRoundError("只有 pending 状态的轮次可以取消", 400);
  }
  const now = new Date();
  await db
    .update(studioHumanInterviewRound)
    .set({
      cancelReason: reason ?? null,
      cancelledAt: now,
      status: "cancelled",
      updatedAt: now,
    })
    .where(eq(studioHumanInterviewRound.id, roundId));
  const updated = await loadRoundById(roundId, organizationId);
  if (!updated) {
    throw new Error("更新后查询失败");
  }
  return updated;
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
  const [row] = await db
    .select({ pipelineStage: studioInterview.pipelineStage })
    .from(studioInterview)
    .where(eq(studioInterview.id, interviewRecordId))
    .limit(1);
  if (!row) {
    return;
  }
  const advanceable: (typeof row.pipelineStage)[] = ["screening", "written_test", "ai_interview"];
  if (!advanceable.includes(row.pipelineStage)) {
    return;
  }
  await db
    .update(studioInterview)
    .set({ pipelineStage: "human_interview", updatedAt: new Date() })
    .where(eq(studioInterview.id, interviewRecordId));
}
