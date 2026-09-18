/* oxlint-disable complexity, no-nested-ternary, unicorn/prefer-ternary, anti-slop/require-safety-comment-for-type-assertion -- Offer edits keep version checks, approval invalidation, and field updates in one lock-protected transaction. */
import { publishOfferTx } from "../../offer-approvals/application/publish-offer";
import { OfferApprovalError, hashRequest } from "../../offer-approvals/dao";
import { invalidateOfferApprovalsTx, recordApprovalEventTx } from "@app/database/offer-approval";
import {
  recruitingOfferApproval,
  recruitingNodeState,
  recruitingFulfillment,
  recruitingOffer,
} from "@app/db-schema/schema";
import { isOfferExpired, offerExpiryEndOfDay } from "@app/shared/offer-expiry";
import { updateRecruitingNodeTx } from "@app/database/recruiting-pipeline";
import type { RecruitingTransaction as Tx } from "@app/database/recruiting-records";
import { lockRecruitingRecord } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
// 每条招聘记录仅允许一份有效 Offer；回退失效版本保留为历史。

import { and, desc, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import type { OfferDraftInput } from "@app/db-schema/studio-interviews";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import { mergeCandidateExpectationsTx } from "./candidate-expectations";

export type { OfferDraftRecord };

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toRecord(row: typeof recruitingOffer.$inferSelect): OfferDraftRecord {
  return {
    baseSalary: row.baseSalary,
    bonus: row.bonus,
    candidateCounter: row.candidateCounter,
    contentRevision: row.contentRevision,
    createdAt: serializeDate(row.createdAt) ?? new Date().toISOString(),
    currency: row.currency,
    currentApprovalId: row.currentApprovalId,
    declineReason: row.declineReason,
    emailRecipient: row.emailRecipient,
    emailSentAt: serializeDate(row.emailSentAt),
    equity: row.equity,
    expiresAt: row.expiresAt ? offerExpiryEndOfDay(row.expiresAt).toISOString() : null,
    id: row.id,
    interviewRecordId: row.recruitingRecordId,
    joiningDate: serializeDate(row.joiningDate),
    notes: row.notes,
    organizationId: row.organizationId,
    position: row.position,
    publicPath: row.publicToken ? `/offer/${encodeURIComponent(row.publicToken)}` : null,
    publishedAt: serializeDate(row.publishedAt),
    publishedBy: row.publishedBy,
    responseAt: serializeDate(row.responseAt),
    responseBy: row.responseBy,
    responseSource: row.responseSource,
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
  operatorId?: string | null;
}

const offerDraftWriteDependencies = {
  lockRecord: lockRecruitingRecord,
  mergeExpectations: mergeCandidateExpectationsTx,
  transaction: <T>(run: (tx: Tx) => Promise<T>): Promise<T> => db.transaction(run),
  updateNode: updateRecruitingNodeTx,
};
export type OfferDraftWriteDependencies = typeof offerDraftWriteDependencies;

// 锁定招聘主记录，串行化存在性检查与创建，防止并发创建第二份 Offer。
// oxlint-disable-next-line complexity -- Creation validates the pipeline lock and writes the complete Offer snapshot atomically.
export async function createOfferDraft(
  { interviewRecordId, organizationId, input, sendImmediately, operatorId }: CreateDraftOptions,
  dependencies: OfferDraftWriteDependencies = offerDraftWriteDependencies,
): Promise<OfferDraftRecord> {
  const id = crypto.randomUUID();
  const now = new Date();

  // oxlint-disable-next-line complexity -- The transaction validates and writes the complete Offer snapshot atomically.
  return await dependencies.transaction(async (tx) => {
    const parent = await dependencies.lockRecord(tx, interviewRecordId, organizationId);
    if (!parent || parent.currentStage !== "offer") {
      throw new OfferDraftError("请先完成谈薪并进入发 Offer 节点", 409);
    }
    const previousOffers = await tx
      .select({
        id: recruitingOffer.id,
        status: recruitingOffer.status,
        version: recruitingOffer.version,
      })
      .from(recruitingOffer)
      .where(
        and(
          eq(recruitingOffer.recruitingRecordId, interviewRecordId),
          eq(recruitingOffer.organizationId, organizationId),
        ),
      );
    if (previousOffers.some((offer) => offer.status !== "superseded")) {
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
      expiresAt: input.expiresAt ? offerExpiryEndOfDay(input.expiresAt) : null,
      id,
      joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
      notes: input.notes ?? null,
      organizationId,
      position: input.position,
      publicToken: null,
      publishedAt: null,
      publishedBy: null,
      recruitingRecordId: interviewRecordId,
      sentAt: null,
      status: "draft",
      updatedAt: now,
      version: Math.max(0, ...previousOffers.map((offer) => offer.version)) + 1,
    });

    const expectations = await dependencies.mergeExpectations(
      tx,
      interviewRecordId,
      organizationId,
      {
        agreedBaseSalary: input.baseSalary,
      },
    );
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
    await dependencies.updateNode(tx, {
      effectiveOfferId: id,
      node: "offer",
      now,
      operatorId: null,
      organizationId,
      recordId: interviewRecordId,
      result: null,
      status: "awaiting_send",
    });
    const [created] = await tx
      .select()
      .from(recruitingOffer)
      .where(eq(recruitingOffer.id, id))
      .limit(1);
    if (!created) {
      throw new Error("创建后查询失败");
    }
    return toRecord(
      sendImmediately ? await publishOfferTx(tx, parent, created, operatorId ?? null) : created,
    );
  });
}

// 编辑草稿：仅 status='draft' 时允许；其他状态用 /respond 或 /cancel 走专属路径。
// Edit a draft; only allowed in 'draft' status.
export interface EditDraftOptions {
  draftId: string;
  organizationId: string;
  input: Partial<OfferDraftInput> & {
    expectedContentRevision?: number;
    invalidateApproval?: boolean;
  };
  operatorId?: string | null;
}

async function lockOfferContext(
  tx: Tx,
  draftId: string,
  organizationId: string,
  lockRecord = lockRecruitingRecord,
) {
  const [identity] = await tx
    .select({ recordId: recruitingOffer.recruitingRecordId })
    .from(recruitingOffer)
    .where(
      and(eq(recruitingOffer.id, draftId), eq(recruitingOffer.organizationId, organizationId)),
    );
  if (!identity) {
    throw new OfferDraftError("Offer 草稿不存在", 404);
  }
  const record = await lockRecord(tx, identity.recordId, organizationId);
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
  if (!draft || draft.status === "superseded" || node?.effectiveOfferId !== draftId) {
    throw new OfferDraftError("该 Offer 已不是当前有效 Offer", 409);
  }
  return { draft, record };
}

export async function editOfferDraft({
  draftId,
  organizationId,
  input,
  operatorId = null,
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
    if (input.expectedContentRevision !== existing.contentRevision) {
      throw new OfferApprovalError("内容修订已变化，请刷新后编辑");
    }
    const [approval] = existing.currentApprovalId
      ? await tx
          .select()
          .from(recruitingOfferApproval)
          .where(eq(recruitingOfferApproval.id, existing.currentApprovalId))
          .for("update")
      : [];
    if (approval?.status === "pending") {
      throw new OfferApprovalError("审批中不可编辑，请先撤回审批");
    }
    // existing.expiresAt / joiningDate 是 Date，resolveDateField 期待 string | null。
    // existing.expiresAt / joiningDate are Date columns; resolveDateField wants strings.
    const expiresAt = input.expiresAt === undefined ? existing.expiresAt : input.expiresAt;
    const next = {
      baseSalary: input.baseSalary ?? existing.baseSalary,
      bonus: input.bonus === undefined ? existing.bonus : input.bonus,
      currency: input.currency ?? existing.currency,
      equity: input.equity === undefined ? existing.equity : input.equity,
      expiresAt: expiresAt ? offerExpiryEndOfDay(expiresAt) : null,
      joiningDate:
        input.joiningDate === undefined
          ? existing.joiningDate
          : input.joiningDate
            ? new Date(input.joiningDate)
            : null,
      notes: input.notes === undefined ? existing.notes : input.notes,
      position: input.position ?? existing.position,
    };
    const previous = Object.fromEntries(
      Object.keys(next).map((key) => [key, existing[key as keyof typeof next]]),
    );
    const changed = hashRequest(next) !== hashRequest(previous);
    if (changed && approval?.status === "approved" && !approval.invalidatedAt) {
      if (!input.invalidateApproval) {
        throw new OfferApprovalError("修改后需重新审批，请明确确认失效并编辑");
      }
      await invalidateOfferApprovalsTx(tx, {
        now,
        offerId: existing.id,
        operatorId,
        organizationId,
        reason: "确认失效并编辑 Offer",
        recordId: existing.recruitingRecordId,
      });
    }
    await tx
      .update(recruitingOffer)
      .set({
        ...next,
        contentRevision: existing.contentRevision + (changed ? 1 : 0),
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
  operatorId: string | null = null,
): Promise<OfferDraftRecord> {
  return await db.transaction(async (tx) => {
    const { draft, record } = await lockOfferContext(tx, draftId, organizationId);
    return toRecord(await publishOfferTx(tx, record, draft, operatorId));
  });
}

export interface RespondOfferOptions {
  draftId: string;
  organizationId: string;
  response: "accepted" | "declined" | "counter";
  candidateCounter?: string | null;
  declineReason?: string | null;
  responseBy?: string | null;
  responseSource?: "candidate" | "hr";
  onResponded?: (
    tx: Tx,
    context: { offerId: string; respondedAt: Date; response: "accepted" | "declined" | "counter" },
  ) => Promise<void>;
}

export async function respondOfferDraft(
  {
    draftId,
    organizationId,
    response,
    candidateCounter,
    declineReason,
    responseBy,
    responseSource = "hr",
    onResponded,
  }: RespondOfferOptions,
  dependencies: OfferDraftWriteDependencies = offerDraftWriteDependencies,
): Promise<OfferDraftRecord> {
  return await dependencies.transaction(async (tx) => {
    const { draft, record } = await lockOfferContext(
      tx,
      draftId,
      organizationId,
      dependencies.lockRecord,
    );
    if (draft.status !== "sent") {
      throw new OfferDraftError("只有已发布、待回复的 Offer 可以记录响应", 400);
    }
    const now = new Date();
    const expiry = draft.publishedSnapshot ? draft.publishedSnapshot.expiresAt : draft.expiresAt;
    if (isOfferExpired(expiry ? new Date(expiry) : null, now)) {
      throw new OfferDraftError("当前 Offer 已过期，请联系招聘负责人。", 409);
    }
    const [updated] = await tx
      .update(recruitingOffer)
      .set({
        candidateCounter: candidateCounter ?? draft.candidateCounter,
        declineReason: response === "declined" ? (declineReason ?? null) : null,
        responseAt: now,
        responseBy: responseBy ?? null,
        responseSource,
        status: response === "counter" ? "sent" : response,
        updatedAt: now,
      })
      .where(eq(recruitingOffer.id, draftId))
      .returning();
    await dependencies.updateNode(tx, {
      effectiveOfferId: draftId,
      expectedEffectiveId: draftId,
      node: "offer",
      now,
      operatorId: null,
      organizationId,
      reason: candidateCounter ?? undefined,
      recordId: record.id,
      result: response === "accepted" ? "pass" : null,
      status: response === "accepted" ? "completed" : "awaiting_response",
    });
    await onResponded?.(tx, { offerId: draftId, respondedAt: now, response });
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
  options: { voidWithHistory?: boolean; operatorId?: string | null } = {},
): Promise<OfferDraftRecord> {
  return await db.transaction(async (tx) => {
    const { draft, record } = await lockOfferContext(tx, draftId, organizationId);
    if (draft.status !== "draft" || draft.sentAt !== null) {
      throw new OfferDraftError("Offer 确认发送后不可删除", 409);
    }
    const history = await tx
      .select()
      .from(recruitingOfferApproval)
      .where(eq(recruitingOfferApproval.offerId, draftId))
      .for("update");
    if (history.some((item) => item.status === "pending")) {
      throw new OfferApprovalError("请先撤回审批后再作废草稿");
    }
    if (history.length && !options.voidWithHistory) {
      throw new OfferApprovalError("该 Offer 有审批历史，请使用作废草稿");
    }
    const now = new Date();
    if (history.length) {
      await invalidateOfferApprovalsTx(tx, {
        now,
        offerId: draftId,
        operatorId: options.operatorId ?? null,
        organizationId,
        reason: "Offer 草稿作废",
        recordId: record.id,
      });
      await recordApprovalEventTx(tx, history[0], "offer_draft_voided", options.operatorId ?? null);
    }
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
    if (history.length) {
      await tx
        .update(recruitingOffer)
        .set({ status: "superseded", updatedAt: now })
        .where(eq(recruitingOffer.id, draftId));
    } else {
      await tx
        .delete(recruitingOffer)
        .where(
          and(eq(recruitingOffer.id, draftId), eq(recruitingOffer.organizationId, organizationId)),
        );
    }
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
