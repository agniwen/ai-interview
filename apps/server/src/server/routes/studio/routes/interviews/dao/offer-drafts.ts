import { updateRecruitingNodeTx } from "@app/database/recruiting-pipeline";
import type { RecruitingTransaction as Tx } from "@app/database/recruiting-records";
import { lockRecruitingRecord } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
// Offer 草稿 DAO。每次新建版本：
//   - version 取 MAX(version) + 1（同候选人下唯一索引保证 race-safe）
//   - 旧的非终态版本（draft / sent）自动 supersede
//   - 终态版本（accepted / declined / expired）不动
//
// Offer draft DAO. Each new version auto-increments and supersedes any
// existing non-terminal (draft/sent) drafts so HR's offer history stays
// linear without manual cleanup.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { recruitingNodeState, recruitingFulfillment, recruitingOffer } from "@app/db-schema/schema";
import type { OfferDraftInput, OfferDraftStatus } from "@app/db-schema/studio-interviews";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";

export type { OfferDraftRecord };

// 非终态状态：新建版本时会被 supersede。
// Non-terminal statuses that get superseded when a new version is created.
const SUPERSEDABLE_STATUSES = new Set<OfferDraftStatus>(["draft", "sent"]);

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

// 日期字段 patch helper：input 传新值就用新值，否则退回 existing 的 ISO 字符串再转回 Date。
// Patch-merge helper for nullable Date columns: input wins; existing reused if absent.
function resolveDateField(next: string | null | undefined, current: string | null): Date | null {
  if (next) {
    return new Date(next);
  }
  return current ? new Date(current) : null;
}

function toRecord(row: typeof recruitingOffer.$inferSelect): OfferDraftRecord {
  return {
    baseSalary: row.baseSalary,
    bonus: row.bonus,
    candidateCounter: row.candidateCounter,
    createdAt: serializeDate(row.createdAt) ?? new Date().toISOString(),
    currency: row.currency,
    equity: row.equity,
    expiresAt: serializeDate(row.expiresAt),
    id: row.id,
    interviewRecordId: row.recruitingRecordId,
    joiningDate: serializeDate(row.joiningDate),
    notes: row.notes,
    organizationId: row.organizationId,
    position: row.position,
    responseAt: serializeDate(row.responseAt),
    sentAt: serializeDate(row.sentAt),
    status: row.status,
    updatedAt: serializeDate(row.updatedAt) ?? new Date().toISOString(),
    version: row.version,
  };
}

export class OfferDraftError extends Error {
  readonly status: 400 | 404 | 409;
  constructor(message: string, status: 400 | 404 | 409) {
    super(message);
    this.name = "OfferDraftError";
    this.status = status;
  }
}

// 列出候选人所有 offer 版本，按 version desc（最新在前）。
// List all offer versions for a candidate, newest first.
export async function listOfferDrafts(
  interviewRecordId: string,
  organizationId: string,
): Promise<OfferDraftRecord[]> {
  const rows = await db
    .select()
    .from(recruitingOffer)
    .where(
      and(
        eq(recruitingOffer.recruitingRecordId, interviewRecordId),
        eq(recruitingOffer.organizationId, organizationId),
      ),
    )
    .orderBy(desc(recruitingOffer.version));
  return rows.map(toRecord);
}

// 加载单条详情，校验组织归属。
// Load a single draft, scoped to org.
export async function loadDraftById(
  draftId: string,
  organizationId: string,
): Promise<OfferDraftRecord | null> {
  const [row] = await db
    .select()
    .from(recruitingOffer)
    .where(and(eq(recruitingOffer.id, draftId), eq(recruitingOffer.organizationId, organizationId)))
    .limit(1);
  return row ? toRecord(row) : null;
}

export interface CreateDraftOptions {
  interviewRecordId: string;
  organizationId: string;
  input: OfferDraftInput;
  // 是否直接发出（默认 false，进 draft 状态）。
  // Whether to send immediately; defaults to draft.
  sendImmediately?: boolean;
}

// 新建版本：MAX(version)+1，旧的非终态版自动 supersede。
// FOR UPDATE 锁确保并发 race 下 version 不冲突（搭配 unique index 兜底）。
//
// Create new version: max(version)+1; supersede any non-terminal predecessors.
// FOR UPDATE lock + unique index protect against concurrent inserts.
export async function createOfferDraft({
  interviewRecordId,
  organizationId,
  input,
  sendImmediately,
}: CreateDraftOptions): Promise<OfferDraftRecord> {
  const id = crypto.randomUUID();
  const now = new Date();

  return await db.transaction(async (tx) => {
    const parent = await lockRecruitingRecord(tx, interviewRecordId, organizationId);
    if (!parent || parent.currentStage !== "offer") {
      throw new OfferDraftError("请先完成流水提供并进入 Offer 节点", 409);
    }
    // 锁同候选人下的所有 draft，串行化新建版本流程。
    // Lock all drafts for this candidate to serialize version creation.
    const existing = await tx
      .select({
        id: recruitingOffer.id,
        status: recruitingOffer.status,
        version: recruitingOffer.version,
      })
      .from(recruitingOffer)
      .where(eq(recruitingOffer.recruitingRecordId, interviewRecordId))
      .orderBy(desc(recruitingOffer.version))
      .for("update");

    const [latestExisting] = existing;
    const nextVersion = latestExisting ? latestExisting.version + 1 : 1;

    // Supersede 所有未结的旧版本。
    // Supersede all non-terminal predecessors.
    const toSupersede = existing
      .filter((row) => SUPERSEDABLE_STATUSES.has(row.status))
      .map((row) => row.id);
    if (toSupersede.length > 0) {
      await tx
        .update(recruitingOffer)
        .set({ status: "superseded", updatedAt: now })
        .where(inArray(recruitingOffer.id, toSupersede));
    }

    await tx.insert(recruitingOffer).values({
      baseSalary: input.baseSalary,
      bonus: input.bonus ?? null,
      createdAt: now,
      currency: input.currency ?? "CNY",
      equity: input.equity ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      id,
      joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
      notes: input.notes ?? null,
      organizationId,
      position: input.position,
      recruitingRecordId: interviewRecordId,
      sentAt: sendImmediately ? now : null,
      status: sendImmediately ? "sent" : "draft",
      updatedAt: now,
      version: nextVersion,
    });

    await tx
      .insert(recruitingFulfillment)
      .values({ organizationId, recruitingRecordId: interviewRecordId, selectedOfferId: id })
      .onConflictDoUpdate({
        set: { selectedOfferId: id, updatedAt: now },
        target: recruitingFulfillment.recruitingRecordId,
      });
    await updateRecruitingNodeTx(tx, {
      effectiveOfferId: id,
      node: "offer",
      now,
      operatorId: null,
      organizationId,
      recordId: interviewRecordId,
      result: null,
      status: sendImmediately ? "awaiting_response" : "awaiting_send",
    });
    const [created] = await tx
      .select()
      .from(recruitingOffer)
      .where(eq(recruitingOffer.id, id))
      .limit(1);
    if (!created) {
      throw new Error("创建后查询失败");
    }
    return toRecord(created);
  });
}

// 编辑草稿：仅 status='draft' 时允许；其他状态用 /respond 或 /cancel 走专属路径。
// Edit a draft; only allowed in 'draft' status.
export interface EditDraftOptions {
  draftId: string;
  organizationId: string;
  input: Partial<OfferDraftInput>;
}

async function lockOfferContext(tx: Tx, draftId: string, organizationId: string) {
  const [identity] = await tx
    .select({ recordId: recruitingOffer.recruitingRecordId })
    .from(recruitingOffer)
    .where(
      and(eq(recruitingOffer.id, draftId), eq(recruitingOffer.organizationId, organizationId)),
    );
  if (!identity) {
    throw new OfferDraftError("Offer 草稿不存在", 404);
  }
  const record = await lockRecruitingRecord(tx, identity.recordId, organizationId);
  if (!record || record.currentStage !== "offer") {
    throw new OfferDraftError("请在当前 Offer 节点处理，历史 Offer 需重新激活后确认", 409);
  }
  const [draft] = await tx
    .select()
    .from(recruitingOffer)
    .where(eq(recruitingOffer.id, draftId))
    .for("update");
  const [node] = await tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, record.id),
        eq(recruitingNodeState.node, "offer"),
      ),
    );
  if (!draft || node?.effectiveOfferId !== draftId) {
    throw new OfferDraftError("该 Offer 已不是当前有效版本", 409);
  }
  return { draft, record };
}

export async function editOfferDraft({
  draftId,
  organizationId,
  input,
}: EditDraftOptions): Promise<OfferDraftRecord> {
  const now = new Date();

  // 事务 + FOR UPDATE：read existing → 校验 status → merge → write。
  // 防止两名 HR 同时编辑同一份草稿造成 (input ?? existing) merge 字段相互覆盖。
  // Transaction + FOR UPDATE: serialize read → validate → merge → write so
  // concurrent edits to the same draft can't lose each other's writes.
  await db.transaction(async (tx) => {
    const { draft: existing } = await lockOfferContext(tx, draftId, organizationId);
    if (existing.status !== "draft") {
      throw new OfferDraftError("只有草稿状态的 Offer 可以编辑", 400);
    }
    // existing.expiresAt / joiningDate 是 Date，resolveDateField 期待 string | null。
    // existing.expiresAt / joiningDate are Date columns; resolveDateField wants strings.
    const existingExpiresAtIso = existing.expiresAt ? existing.expiresAt.toISOString() : null;
    const existingJoiningDateIso = existing.joiningDate ? existing.joiningDate.toISOString() : null;
    await tx
      .update(recruitingOffer)
      .set({
        baseSalary: input.baseSalary ?? existing.baseSalary,
        bonus: input.bonus ?? existing.bonus,
        currency: input.currency ?? existing.currency,
        equity: input.equity ?? existing.equity,
        expiresAt: resolveDateField(input.expiresAt, existingExpiresAtIso),
        joiningDate: resolveDateField(input.joiningDate, existingJoiningDateIso),
        notes: input.notes ?? existing.notes,
        position: input.position ?? existing.position,
        updatedAt: now,
      })
      .where(eq(recruitingOffer.id, draftId));
  });
  const updated = await loadDraftById(draftId, organizationId);
  if (!updated) {
    throw new Error("更新后查询失败");
  }
  return updated;
}

export async function sendOfferDraft(
  draftId: string,
  organizationId: string,
): Promise<OfferDraftRecord> {
  return await db.transaction(async (tx) => {
    const { draft, record } = await lockOfferContext(tx, draftId, organizationId);
    if (draft.status !== "draft") {
      throw new OfferDraftError("只有草稿状态的 Offer 可以发出", 400);
    }
    const now = new Date();
    const [updated] = await tx
      .update(recruitingOffer)
      .set({ sentAt: now, status: "sent", updatedAt: now })
      .where(eq(recruitingOffer.id, draftId))
      .returning();
    await updateRecruitingNodeTx(tx, {
      effectiveOfferId: draftId,
      expectedEffectiveId: draftId,
      node: "offer",
      now,
      operatorId: null,
      organizationId,
      recordId: record.id,
      status: "awaiting_response",
    });
    if (!updated) {
      throw new Error("发出后查询失败");
    }
    return toRecord(updated);
  });
}

export interface RespondOfferOptions {
  draftId: string;
  organizationId: string;
  response: "accepted" | "declined" | "counter";
  candidateCounter?: string | null;
}

export async function respondOfferDraft({
  draftId,
  organizationId,
  response,
  candidateCounter,
}: RespondOfferOptions): Promise<OfferDraftRecord> {
  return await db.transaction(async (tx) => {
    const { draft, record } = await lockOfferContext(tx, draftId, organizationId);
    if (draft.status !== "sent") {
      throw new OfferDraftError("只有已发送的 Offer 可以记录响应", 400);
    }
    const now = new Date();
    const [updated] = await tx
      .update(recruitingOffer)
      .set({
        candidateCounter: candidateCounter ?? draft.candidateCounter,
        responseAt: now,
        status: response === "counter" ? "sent" : response,
        updatedAt: now,
      })
      .where(eq(recruitingOffer.id, draftId))
      .returning();
    const result = response === "accepted" ? "pass" : "fail";
    await updateRecruitingNodeTx(tx, {
      closeReason: "offer_declined",
      effectiveOfferId: draftId,
      expectedEffectiveId: draftId,
      node: "offer",
      now,
      operatorId: null,
      organizationId,
      reason: candidateCounter ?? undefined,
      recordId: record.id,
      result: response === "counter" ? null : result,
      status: response === "counter" ? "negotiating" : "completed",
    });
    if (!updated) {
      throw new Error("响应后查询失败");
    }
    return toRecord(updated);
  });
}

/** 撤回只取消当前 Offer 依据，不擅自回退面试节点；回退由明确的流程操作完成。 */
export async function cancelOfferDraft(
  draftId: string,
  organizationId: string,
): Promise<OfferDraftRecord> {
  return await db.transaction(async (tx) => {
    const { draft, record } = await lockOfferContext(tx, draftId, organizationId);
    if (draft.status !== "sent" && draft.status !== "draft") {
      throw new OfferDraftError("已结状态的 Offer 不可撤回", 400);
    }
    const now = new Date();
    const [updated] = await tx
      .update(recruitingOffer)
      .set({ status: "expired", updatedAt: now })
      .where(eq(recruitingOffer.id, draftId))
      .returning();
    await tx
      .update(recruitingFulfillment)
      .set({ selectedOfferId: null })
      .where(eq(recruitingFulfillment.recruitingRecordId, record.id));
    await updateRecruitingNodeTx(tx, {
      effectiveOfferId: null,
      expectedEffectiveId: draftId,
      node: "offer",
      now,
      operatorId: null,
      organizationId,
      reason: "撤回当前 Offer",
      recordId: record.id,
      result: null,
      status: "pending",
    });
    if (!updated) {
      throw new Error("撤回后查询失败");
    }
    return toRecord(updated);
  });
}

/** 保留现有调用契约；创建 Offer 本身不再跳过流水节点或自动推进流程。 */
export async function maybeAdvanceToOffer(
  interviewRecordId: string,
  organizationId: string,
): Promise<void> {
  const [record] = await db
    .select({ stage: recruitingRecordReadModel.currentStage })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, interviewRecordId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
      ),
    );
  if (!record || record.stage !== "offer") {
    throw new OfferDraftError("请先完成流水提供并进入 Offer 节点", 409);
  }
}
