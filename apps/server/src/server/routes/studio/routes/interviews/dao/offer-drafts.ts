import { updateRecruitingNodeTx } from "@app/database/recruiting-pipeline";
import type { RecruitingTransaction as Tx } from "@app/database/recruiting-records";
import { lockRecruitingRecord } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
// 同一候选人只允许一份 Offer；未发送时可删除后重新创建，内部 version 固定为 1。

import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { recruitingNodeState, recruitingFulfillment, recruitingOffer } from "@app/db-schema/schema";
import type { OfferDraftInput } from "@app/db-schema/studio-interviews";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import { mergeCandidateExpectationsTx } from "./candidate-expectations";

export type { OfferDraftRecord };

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

// 锁定招聘主记录，串行化存在性检查与创建，防止并发创建第二份 Offer。
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
      throw new OfferDraftError("请先完成谈薪并进入发 Offer 节点", 409);
    }
    const [existing] = await tx
      .select({ id: recruitingOffer.id })
      .from(recruitingOffer)
      .where(
        and(
          eq(recruitingOffer.recruitingRecordId, interviewRecordId),
          eq(recruitingOffer.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new OfferDraftError(
        "该候选人已有 Offer，请编辑现有草稿；删除未发送的 Offer 后才能重新创建",
        409,
      );
    }
    const [node] = await tx
      .select({ status: recruitingNodeState.status })
      .from(recruitingNodeState)
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, interviewRecordId),
          eq(recruitingNodeState.organizationId, organizationId),
          eq(recruitingNodeState.node, "offer"),
        ),
      );
    if (node?.status !== "awaiting_send" && node?.status !== "pending") {
      throw new OfferDraftError("请先确认谈薪完成并进入发 Offer 阶段", 409);
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
      version: 1,
    });

    const expectations = await mergeCandidateExpectationsTx(tx, interviewRecordId, organizationId, {
      agreedBaseSalary: input.baseSalary,
    });
    if (!expectations) {
      throw new OfferDraftError("候选人记录不存在", 404);
    }

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
    throw new OfferDraftError("该 Offer 已不是当前有效 Offer", 409);
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
    if (input.baseSalary !== undefined) {
      const expectations = await mergeCandidateExpectationsTx(
        tx,
        existing.recruitingRecordId,
        organizationId,
        { agreedBaseSalary: input.baseSalary },
      );
      if (!expectations) {
        throw new OfferDraftError("候选人记录不存在", 404);
      }
    }
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
      status: response === "counter" ? "awaiting_response" : "completed",
    });
    if (!updated) {
      throw new Error("响应后查询失败");
    }
    return toRecord(updated);
  });
}

/** 只有未发送草稿可删除；先解除外键引用，再删除，全部在招聘记录锁内完成。 */
export async function deleteOfferDraft(
  draftId: string,
  organizationId: string,
): Promise<OfferDraftRecord> {
  return await db.transaction(async (tx) => {
    const { draft, record } = await lockOfferContext(tx, draftId, organizationId);
    if (draft.status !== "draft" || draft.sentAt !== null) {
      throw new OfferDraftError("Offer 确认发送后不可删除", 409);
    }
    const now = new Date();
    await tx
      .update(recruitingFulfillment)
      .set({ selectedOfferId: null, updatedAt: now })
      .where(
        and(
          eq(recruitingFulfillment.recruitingRecordId, record.id),
          eq(recruitingFulfillment.organizationId, organizationId),
        ),
      );
    await updateRecruitingNodeTx(tx, {
      effectiveOfferId: null,
      expectedEffectiveId: draftId,
      node: "offer",
      now,
      operatorId: null,
      organizationId,
      reason: "删除未发送的 Offer",
      recordId: record.id,
      result: null,
      status: "awaiting_send",
    });
    await tx
      .delete(recruitingOffer)
      .where(
        and(eq(recruitingOffer.id, draftId), eq(recruitingOffer.organizationId, organizationId)),
      );
    return toRecord(draft);
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
    throw new OfferDraftError("请先完成谈薪并进入发 Offer 节点", 409);
  }
}
