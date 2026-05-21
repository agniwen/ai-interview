import "server-only";

// Offer 草稿 DAO。每次新建版本：
//   - version 取 MAX(version) + 1（同候选人下唯一索引保证 race-safe）
//   - 旧的非终态版本（draft / sent）自动 supersede
//   - 终态版本（accepted / declined / expired）不动
//
// Offer draft DAO. Each new version auto-increments and supersedes any
// existing non-terminal (draft/sent) drafts so HR's offer history stays
// linear without manual cleanup.

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/server/db";
import { studioInterview, studioOfferDraft } from "@arc/db-schema/schema";
import type { OfferDraftInput, OfferDraftStatus } from "@arc/db-schema/studio-interviews";
import type { OfferDraftRecord } from "@/lib/shared/studio-pipeline-stages";

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

function toRecord(row: typeof studioOfferDraft.$inferSelect): OfferDraftRecord {
  return {
    baseSalary: row.baseSalary,
    bonus: row.bonus,
    candidateCounter: row.candidateCounter,
    createdAt: serializeDate(row.createdAt) ?? new Date().toISOString(),
    currency: row.currency,
    equity: row.equity,
    expiresAt: serializeDate(row.expiresAt),
    id: row.id,
    interviewRecordId: row.interviewRecordId,
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
  readonly status: 400 | 404;
  constructor(message: string, status: 400 | 404) {
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
    .from(studioOfferDraft)
    .where(
      and(
        eq(studioOfferDraft.interviewRecordId, interviewRecordId),
        eq(studioOfferDraft.organizationId, organizationId),
      ),
    )
    .orderBy(desc(studioOfferDraft.version));
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
    .from(studioOfferDraft)
    .where(
      and(eq(studioOfferDraft.id, draftId), eq(studioOfferDraft.organizationId, organizationId)),
    )
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
    // 锁同候选人下的所有 draft，串行化新建版本流程。
    // Lock all drafts for this candidate to serialize version creation.
    const existing = await tx
      .select({
        id: studioOfferDraft.id,
        status: studioOfferDraft.status,
        version: studioOfferDraft.version,
      })
      .from(studioOfferDraft)
      .where(eq(studioOfferDraft.interviewRecordId, interviewRecordId))
      .orderBy(desc(studioOfferDraft.version))
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
        .update(studioOfferDraft)
        .set({ status: "superseded", updatedAt: now })
        .where(inArray(studioOfferDraft.id, toSupersede));
    }

    await tx.insert(studioOfferDraft).values({
      baseSalary: input.baseSalary,
      bonus: input.bonus ?? null,
      createdAt: now,
      currency: input.currency ?? "CNY",
      equity: input.equity ?? null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      id,
      interviewRecordId,
      joiningDate: input.joiningDate ? new Date(input.joiningDate) : null,
      notes: input.notes ?? null,
      organizationId,
      position: input.position,
      sentAt: sendImmediately ? now : null,
      status: sendImmediately ? "sent" : "draft",
      updatedAt: now,
      version: nextVersion,
    });

    const [created] = await tx
      .select()
      .from(studioOfferDraft)
      .where(eq(studioOfferDraft.id, id))
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

export async function editOfferDraft({
  draftId,
  organizationId,
  input,
}: EditDraftOptions): Promise<OfferDraftRecord> {
  const existing = await loadDraftById(draftId, organizationId);
  if (!existing) {
    throw new OfferDraftError("Offer 草稿不存在", 404);
  }
  if (existing.status !== "draft") {
    throw new OfferDraftError("只有草稿状态的 Offer 可以编辑", 400);
  }
  const now = new Date();
  await db
    .update(studioOfferDraft)
    .set({
      baseSalary: input.baseSalary ?? existing.baseSalary,
      bonus: input.bonus ?? existing.bonus,
      currency: input.currency ?? existing.currency,
      equity: input.equity ?? existing.equity,
      expiresAt: resolveDateField(input.expiresAt, existing.expiresAt),
      joiningDate: resolveDateField(input.joiningDate, existing.joiningDate),
      notes: input.notes ?? existing.notes,
      position: input.position ?? existing.position,
      updatedAt: now,
    })
    .where(eq(studioOfferDraft.id, draftId));
  const updated = await loadDraftById(draftId, organizationId);
  if (!updated) {
    throw new Error("更新后查询失败");
  }
  return updated;
}

// draft → sent：发出 Offer。
// Mark draft as sent.
export async function sendOfferDraft(
  draftId: string,
  organizationId: string,
): Promise<OfferDraftRecord> {
  const existing = await loadDraftById(draftId, organizationId);
  if (!existing) {
    throw new OfferDraftError("Offer 草稿不存在", 404);
  }
  if (existing.status !== "draft") {
    throw new OfferDraftError("只有草稿状态的 Offer 可以发出", 400);
  }
  const now = new Date();
  await db
    .update(studioOfferDraft)
    .set({ sentAt: now, status: "sent", updatedAt: now })
    .where(eq(studioOfferDraft.id, draftId));
  const updated = await loadDraftById(draftId, organizationId);
  if (!updated) {
    throw new Error("发出后查询失败");
  }
  return updated;
}

// sent → accepted/declined/counter（counter 不改变 status，只记 candidateCounter；
// HR 后续通过新建版本响应议价）。
// Record candidate response. counter doesn't terminate the draft — it just
// records the counter text; HR creates a new version to respond.
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
  const existing = await loadDraftById(draftId, organizationId);
  if (!existing) {
    throw new OfferDraftError("Offer 草稿不存在", 404);
  }
  if (existing.status !== "sent") {
    throw new OfferDraftError("只有已发送的 Offer 可以记录响应", 400);
  }
  const now = new Date();
  // counter 保持 status='sent'，让 HR 看到这版还在协商；accepted/declined 终态化。
  // counter keeps status='sent' so HR sees it's still under negotiation;
  // accepted/declined move to terminal status.
  const nextStatus: OfferDraftStatus = response === "counter" ? "sent" : response;
  await db
    .update(studioOfferDraft)
    .set({
      candidateCounter: candidateCounter ?? existing.candidateCounter,
      responseAt: now,
      status: nextStatus,
      updatedAt: now,
    })
    .where(eq(studioOfferDraft.id, draftId));
  const updated = await loadDraftById(draftId, organizationId);
  if (!updated) {
    throw new Error("响应后查询失败");
  }
  return updated;
}

// Sent Offer 撤回：HR 主动把已发出的 Offer 置为 expired（语义：撤回 / 过期 / 不再有效）。
// 没用 declined 是因为 declined 是候选人拒绝的语义。
//
// HR-side withdrawal of a sent offer; uses 'expired' instead of 'declined' to
// keep semantics distinct (declined = candidate said no).
export async function cancelOfferDraft(
  draftId: string,
  organizationId: string,
): Promise<OfferDraftRecord> {
  const existing = await loadDraftById(draftId, organizationId);
  if (!existing) {
    throw new OfferDraftError("Offer 草稿不存在", 404);
  }
  if (existing.status !== "sent" && existing.status !== "draft") {
    throw new OfferDraftError("已结状态的 Offer 不可撤回", 400);
  }
  const now = new Date();
  await db
    .update(studioOfferDraft)
    .set({ status: "expired", updatedAt: now })
    .where(eq(studioOfferDraft.id, draftId));
  const updated = await loadDraftById(draftId, organizationId);
  if (!updated) {
    throw new Error("撤回后查询失败");
  }
  return updated;
}

// 创建 Offer 时自动推进候选人 pipelineStage 到 offer。
// 仅在创建第一版（同候选人下没有任何 draft 行时之前的状态）触发，
// 避免每次新版都跳一次。守卫不从 closed / offer 推（offer 不动 / closed 阻拦）。
//
// Auto-advance to offer stage when the candidate's first draft is created.
// Won't move from offer/closed.
export async function maybeAdvanceToOffer(
  interviewRecordId: string,
  organizationId: string,
): Promise<void> {
  const drafts = await db
    .select({ id: studioOfferDraft.id })
    .from(studioOfferDraft)
    .where(
      and(
        eq(studioOfferDraft.interviewRecordId, interviewRecordId),
        eq(studioOfferDraft.organizationId, organizationId),
      ),
    )
    .limit(2);
  if (drafts.length !== 1) {
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
  const advanceable: (typeof row.pipelineStage)[] = [
    "screening",
    "written_test",
    "ai_interview",
    "human_interview",
  ];
  if (!advanceable.includes(row.pipelineStage)) {
    return;
  }
  await db
    .update(studioInterview)
    .set({ pipelineStage: "offer", updatedAt: new Date() })
    .where(eq(studioInterview.id, interviewRecordId));
}
