import { and, eq } from "drizzle-orm";
import {
  aiInterviewRound,
  humanInterviewRound,
  recruitingEvent,
  recruitingFulfillment,
  recruitingNodeState,
  recruitingNodeValues,
  recruitingOffer,
  recruitingRecord,
} from "@app/db-schema/schema";
import type {
  RecruitingCloseReason,
  RecruitingNode,
  RecruitingNodeResult,
  RecruitingNodeStatus,
} from "@app/db-schema/schema";
import type { JsonObject } from "@app/db-schema/json";
import { closedHiredDetailsSchema } from "@app/db-schema/studio-interviews";
import type { CandidateOutcome } from "@app/db-schema/studio-interviews";
import type { Database } from "./index";
import { reopenInterviewEvidence } from "./recruiting-reopen-evidence";
import { invalidateRecruitingNodeNotificationsTx } from "./recruiting-notification-invalidation";

export type RecruitingTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type RecordRow = typeof recruitingRecord.$inferSelect;
type NodeRow = typeof recruitingNodeState.$inferSelect;

export class RecruitingPipelineError extends Error {
  readonly code: "not_found" | "conflict" | "invalid";

  constructor(message: string, code: "not_found" | "conflict" | "invalid") {
    super(message);
    this.name = "RecruitingPipelineError";
    this.code = code;
  }
}

export interface RecruitingPipelineCommand {
  recordId: string;
  organizationId: string;
  operatorId: string | null;
  expectedVersion?: number;
  now?: Date;
}

export interface RecruitingPipelineResult {
  changed: boolean;
  currentStage: RecordRow["currentStage"];
  outcome: CandidateOutcome;
  version: number;
}

function recordWhere(input: RecruitingPipelineCommand) {
  return and(
    eq(recruitingRecord.id, input.recordId),
    eq(recruitingRecord.organizationId, input.organizationId),
  );
}

async function lockRecord(tx: RecruitingTransaction, input: RecruitingPipelineCommand) {
  const [record] = await tx.select().from(recruitingRecord).where(recordWhere(input)).for("update");
  if (!record) {
    throw new RecruitingPipelineError("招聘记录不存在。", "not_found");
  }
  if (input.expectedVersion !== undefined && record.version !== input.expectedVersion) {
    throw new RecruitingPipelineError("招聘流程已被更新，请刷新后重试。", "conflict");
  }
  return record;
}

function result(record: RecordRow, changed: boolean): RecruitingPipelineResult {
  return {
    changed,
    currentStage: record.currentStage,
    outcome: record.outcome,
    version: record.version,
  };
}

function loadNodes(tx: RecruitingTransaction, input: RecruitingPipelineCommand) {
  return tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, input.recordId),
        eq(recruitingNodeState.organizationId, input.organizationId),
      ),
    );
}

function snapshotNode(node: NodeRow): JsonObject {
  return {
    completedAt: node.completedAt?.toISOString() ?? null,
    decidedAt: node.decidedAt?.toISOString() ?? null,
    decidedBy: node.decidedBy,
    effectiveAiRoundId: node.effectiveAiRoundId,
    effectiveHumanRoundId: node.effectiveHumanRoundId,
    effectiveOfferId: node.effectiveOfferId,
    enteredAt: node.enteredAt?.toISOString() ?? null,
    node: node.node,
    reason: node.reason,
    result: node.result,
    status: node.status,
  };
}

async function writeRecordEvent(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand,
  record: RecordRow,
  patch: Partial<typeof recruitingRecord.$inferInsert>,
  action: string,
  detail: JsonObject,
) {
  const now = input.now ?? new Date();
  const [updated] = await tx
    .update(recruitingRecord)
    .set({
      ...patch,
      updatedAt: now,
      version: record.version + 1,
    })
    .where(recordWhere(input))
    .returning();
  if (!updated) {
    throw new RecruitingPipelineError("招聘记录不存在。", "not_found");
  }
  await tx.insert(recruitingEvent).values({
    action,
    createdAt: now,
    detail,
    fromOutcome: record.outcome,
    fromStage: record.currentStage,
    id: crypto.randomUUID(),
    operatorId: input.operatorId,
    organizationId: input.organizationId,
    pipelineVersion: updated.version,
    reasonCode: updated.closeReason,
    recruitingRecordId: input.recordId,
    toOutcome: updated.outcome,
    toStage: updated.currentStage,
  });
  return result(updated, true);
}

function requireReason(reason: string | undefined) {
  if (!reason?.trim()) {
    throw new RecruitingPipelineError("请填写本次流程调整原因。", "invalid");
  }
  return reason.trim();
}

function requireActive(record: RecordRow): RecruitingNode {
  if (record.currentStage === "closed") {
    throw new RecruitingPipelineError("招聘流程已结束，请先重新激活。", "conflict");
  }
  return record.currentStage;
}

async function putNode(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand,
  node: RecruitingNode,
  patch: Partial<typeof recruitingNodeState.$inferInsert>,
) {
  const values = {
    ...patch,
    node,
    organizationId: input.organizationId,
    recruitingRecordId: input.recordId,
    updatedAt: input.now ?? new Date(),
  };
  await tx
    .insert(recruitingNodeState)
    .values(values)
    .onConflictDoUpdate({
      set: { ...patch, updatedAt: values.updatedAt },
      target: [recruitingNodeState.recruitingRecordId, recruitingNodeState.node],
    });
}

const clearNodeEvidence = {
  completedAt: null,
  decidedAt: null,
  decidedBy: null,
  effectiveAiRoundId: null,
  effectiveHumanRoundId: null,
  effectiveOfferId: null,
  result: null,
} as const;

/** 显式推进；不会因为某个旧轮次曾经通过，就将它重新当作当前结果。 */
export async function transitionRecruitingNodeTx(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand & {
    targetNode: RecruitingNode;
    skipNodes?: RecruitingNode[];
    reason?: string;
  },
): Promise<RecruitingPipelineResult> {
  const record = await lockRecord(tx, input);
  const from = requireActive(record);
  if (from === input.targetNode) {
    return result(record, false);
  }
  const start = recruitingNodeValues.indexOf(from);
  const end = recruitingNodeValues.indexOf(input.targetNode);
  if (end <= start) {
    throw new RecruitingPipelineError("回到之前节点请使用流程回退操作。", "invalid");
  }
  const nodes = await loadNodes(tx, input);
  if (nodes.find((node) => node.node === "screening")?.result !== "pass") {
    throw new RecruitingPipelineError("请先将简历筛选标记为通过，再进入后续流程。", "invalid");
  }
  const traversed = recruitingNodeValues.slice(start, end);
  const skipped = new Set(input.skipNodes);
  if ([...skipped].some((node) => !traversed.includes(node))) {
    throw new RecruitingPipelineError("只能跳过本次推进途经的节点。", "invalid");
  }
  if (skipped.size > 0) {
    requireReason(input.reason);
    if (
      end > recruitingNodeValues.indexOf("second_interview") ||
      [...skipped].some((node) => node !== "ai_interview")
    ) {
      throw new RecruitingPipelineError("只允许在直接安排真人面试时明确跳过 AI 初面。", "invalid");
    }
  }
  for (const node of traversed) {
    const existing = nodes.find((row) => row.node === node);
    if (
      !skipped.has(node) &&
      !(existing?.status === "completed" && existing.result === "pass") &&
      existing?.status !== "skipped"
    ) {
      throw new RecruitingPipelineError(
        "请先完成当前节点并确认通过，或明确记录跳过原因。",
        "invalid",
      );
    }
  }
  const now = input.now ?? new Date();
  for (const node of skipped) {
    await putNode(tx, input, node, {
      ...clearNodeEvidence,
      enteredAt: now,
      reason: requireReason(input.reason),
      status: "skipped",
    });
  }
  await putNode(tx, input, input.targetNode, {
    ...clearNodeEvidence,
    enteredAt: now,
    reason: null,
    status: "pending",
  });
  return writeRecordEvent(
    tx,
    input,
    record,
    { currentStage: input.targetNode, stageEnteredAt: now },
    "recruiting_node_advanced",
    {
      previousNodes: nodes.filter((node) => traversed.includes(node.node)).map(snapshotNode),
      reason: input.reason ?? null,
      skippedNodes: [...skipped],
    },
  );
}

/** 回开与主动回退共用：清除目标结论、保留已完成面试供重评，下游有效结果冻结进历史。 */
// oxlint-disable-next-line complexity -- 回退的字段失效规则必须在同一个事务中按节点顺序核验。
export async function reopenRecruitingRecordTx(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand & {
    targetNode: RecruitingNode;
    targetStatus?: "pending";
    reason: string;
  },
): Promise<RecruitingPipelineResult> {
  const reason = requireReason(input.reason);
  const record = await lockRecord(tx, input);
  const previous = record.currentStage === "closed" ? record.closedFromNode : record.currentStage;
  const nodes = await loadNodes(tx, input);
  const target = nodes.find((row) => row.node === input.targetNode);
  const targetIndex = recruitingNodeValues.indexOf(input.targetNode);
  if (
    !previous ||
    targetIndex > recruitingNodeValues.indexOf(previous) ||
    (!target?.enteredAt && (!target || target.status === "inactive"))
  ) {
    throw new RecruitingPipelineError("只能回到本次招聘已经到达的当前或更早节点。", "invalid");
  }
  const targetEvidence = await reopenInterviewEvidence(tx, input, target);
  const affected = recruitingNodeValues.slice(targetIndex);
  const cancelledNotificationIds = await invalidateRecruitingNodeNotificationsTx(
    tx,
    input,
    affected,
  );
  const [fulfillment] = await tx
    .select()
    .from(recruitingFulfillment)
    .where(eq(recruitingFulfillment.recruitingRecordId, input.recordId));
  const now = input.now ?? new Date();
  for (const node of affected) {
    await putNode(tx, input, node, {
      ...clearNodeEvidence,
      enteredAt: node === input.targetNode ? now : null,
      reason: node === input.targetNode ? reason : null,
      status: node === input.targetNode ? "pending" : "inactive",
      ...(node === input.targetNode ? targetEvidence : clearNodeEvidence),
    });
  }
  if (fulfillment) {
    await tx
      .update(recruitingFulfillment)
      .set({
        actualJoiningDate: null,
        backgroundCheckCompletedAt:
          targetIndex <= recruitingNodeValues.indexOf("background_check") ? null : undefined,
        backgroundCheckStartedAt:
          targetIndex <= recruitingNodeValues.indexOf("background_check") ? null : undefined,
        onboardingConfirmedAt: null,
        onboardingConfirmedBy: null,
        selectedOfferId: targetIndex <= recruitingNodeValues.indexOf("offer") ? null : undefined,
        updatedAt: now,
      })
      .where(eq(recruitingFulfillment.recruitingRecordId, input.recordId));
  }
  return writeRecordEvent(
    tx,
    input,
    record,
    {
      closeDetails: null,
      closeReason: null,
      closedAt: null,
      closedFromNode: null,
      currentStage: input.targetNode,
      outcome: "in_pipeline",
      stageEnteredAt: now,
    },
    "recruiting_reopened",
    {
      cancelledNotificationIds,
      invalidatedNodes: nodes.filter((node) => affected.includes(node.node)).map(snapshotNode),
      previousClose: {
        closedAt: record.closedAt?.toISOString() ?? null,
        details: record.closeDetails,
        node: record.closedFromNode,
        reason: record.closeReason,
      },
      previousFulfillment: fulfillment
        ? {
            actualJoiningDate: fulfillment.actualJoiningDate,
            backgroundCheckCompletedAt:
              fulfillment.backgroundCheckCompletedAt?.toISOString() ?? null,
            backgroundCheckStartedAt: fulfillment.backgroundCheckStartedAt?.toISOString() ?? null,
            onboardingConfirmedAt: fulfillment.onboardingConfirmedAt?.toISOString() ?? null,
            onboardingConfirmedBy: fulfillment.onboardingConfirmedBy,
            selectedOfferId: fulfillment.selectedOfferId,
          }
        : null,
      reason,
    },
  );
}

function closeReasonForNode(
  node: RecruitingNode,
  resultValue: "fail" | "withdrawn",
): RecruitingCloseReason {
  if (resultValue === "withdrawn") {
    return node === "onboarding" ? "onboarding_no_show" : "candidate_withdrew";
  }
  if (node === "screening") {
    return "resume_rejected";
  }
  if (node === "background_check") {
    return "background_check_failed";
  }
  if (node === "offer") {
    return "salary_disagreement";
  }
  return node === "ai_interview" || node === "second_interview" || node === "final_interview"
    ? "interview_failed"
    : "other";
}

function nodeResultForOutcome(outcome: CandidateOutcome): RecruitingNodeResult {
  if (outcome === "hired") {
    return "pass";
  }
  if (outcome === "rejected") {
    return "fail";
  }
  return "withdrawn";
}

function outcomeForNodeResult(
  nodeResult: RecruitingNodeResult,
): Exclude<CandidateOutcome, "in_pipeline"> {
  if (nodeResult === "pass") {
    return "hired";
  }
  if (nodeResult === "fail") {
    return "rejected";
  }
  return "withdrawn";
}

function joiningDateFromDetails(details: JsonObject | undefined): string | null | undefined {
  const hired = closedHiredDetailsSchema.nullish().safeParse(details?.hiredDetails);
  if (!hired.success) {
    throw new RecruitingPipelineError("入职信息格式无效。", "invalid");
  }
  const value = hired.data?.actualJoiningDate;
  if (value === undefined || value === null) {
    return value;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new RecruitingPipelineError("入职日期必须为有效的年-月-日。", "invalid");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new RecruitingPipelineError("入职日期无效。", "invalid");
  }
  return value;
}

async function closeLocked(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand & {
    outcome: Exclude<CandidateOutcome, "in_pipeline">;
    closeReason: RecruitingCloseReason;
    reason?: string;
    details?: JsonObject;
  },
  record: RecordRow,
  previousNodes: JsonObject[] = [],
) {
  const node = requireActive(record);
  if (
    (input.outcome === "hired") !== (input.closeReason === "onboarded") ||
    (input.outcome === "hired" && node !== "onboarding")
  ) {
    throw new RecruitingPipelineError("只有在入职节点确认入职，才能完成招聘。", "invalid");
  }
  const now = input.now ?? new Date();
  if (input.outcome === "hired") {
    const confirmation = {
      actualJoiningDate: joiningDateFromDetails(input.details),
      onboardingConfirmedAt: now,
      onboardingConfirmedBy: input.operatorId,
      updatedAt: now,
    };
    await tx
      .insert(recruitingFulfillment)
      .values({
        ...confirmation,
        organizationId: input.organizationId,
        recruitingRecordId: input.recordId,
      })
      .onConflictDoUpdate({ set: confirmation, target: recruitingFulfillment.recruitingRecordId });
  }
  await putNode(tx, input, node, {
    completedAt: now,
    decidedAt: now,
    decidedBy: input.operatorId,
    reason: input.reason ?? null,
    result: nodeResultForOutcome(input.outcome),
    status: "completed",
  });
  return writeRecordEvent(
    tx,
    input,
    record,
    {
      closeDetails: {
        ...input.details,
        // 关闭会把节点统一标为 completed，保留原进度供招聘台子流程归属使用。
        previousNodeStatus:
          previousNodes.find((previous) => previous.node === node)?.status ?? null,
        reason: input.reason ?? null,
      },
      closeReason: input.closeReason,
      closedAt: now,
      closedFromNode: node,
      currentStage: "closed",
      outcome: input.outcome,
      stageEnteredAt: now,
    },
    "recruiting_closed",
    { previousNodes, reason: input.reason ?? null },
  );
}

/** 结束只改变流程状态；不删除轮次、材料或评价，也不发送外部通知。 */
export async function closeRecruitingRecordTx(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand & {
    outcome: Exclude<CandidateOutcome, "in_pipeline">;
    closeReason: RecruitingCloseReason;
    reason?: string;
    details?: JsonObject;
  },
): Promise<RecruitingPipelineResult> {
  const record = await lockRecord(tx, input);
  if (
    record.currentStage === "closed" &&
    record.outcome === input.outcome &&
    record.closeReason === input.closeReason
  ) {
    return result(record, false);
  }
  const nodes = await loadNodes(tx, input);
  return closeLocked(tx, input, record, nodes.map(snapshotNode));
}

export interface RecruitingNodeUpdate extends RecruitingPipelineCommand {
  node: RecruitingNode;
  status: Exclude<RecruitingNodeStatus, "inactive" | "skipped">;
  result?: RecruitingNodeResult | null;
  effectiveAiRoundId?: string | null;
  effectiveHumanRoundId?: string | null;
  effectiveOfferId?: string | null;
  /** 异步回调必须带原依据，回退后即便仍处同名节点也不会重新激活旧轮次。 */
  expectedEffectiveId?: string;
  reason?: string;
  closeReason?: RecruitingCloseReason;
}

function validateNodeProgress(input: RecruitingNodeUpdate) {
  if ((input.status === "completed") !== Boolean(input.result)) {
    throw new RecruitingPipelineError("节点完成时必须提供通过、淘汰或放弃结论。", "invalid");
  }
  const common = input.status === "pending" || input.status === "completed";
  const interview =
    ["ai_interview", "second_interview", "final_interview"].includes(input.node) &&
    ["scheduled", "in_progress", "awaiting_review"].includes(input.status);
  const material =
    ["income_proof", "background_check"].includes(input.node) &&
    ["in_progress", "awaiting_review"].includes(input.status);
  const offer =
    input.node === "offer" &&
    ["negotiating", "awaiting_send", "awaiting_response"].includes(input.status);
  if (!common && !interview && !material && !offer) {
    throw new RecruitingPipelineError("此节点不支持该进度状态。", "invalid");
  }
}

// oxlint-disable-next-line complexity -- 不同依据分别核验真实执行状态及复合归属，不能只依赖客户端传入的结论。
async function validateEvidence(
  tx: RecruitingTransaction,
  input: RecruitingNodeUpdate,
  values: Pick<NodeRow, "effectiveAiRoundId" | "effectiveHumanRoundId" | "effectiveOfferId">,
) {
  if (values.effectiveAiRoundId) {
    if (input.node !== "ai_interview") {
      throw new RecruitingPipelineError("AI 面试依据只能用于 AI 初面节点。", "invalid");
    }
    const [round] = await tx
      .select()
      .from(aiInterviewRound)
      .where(
        and(
          eq(aiInterviewRound.id, values.effectiveAiRoundId),
          eq(aiInterviewRound.recruitingRecordId, input.recordId),
          eq(aiInterviewRound.organizationId, input.organizationId),
        ),
      );
    if (
      !round ||
      (input.result === "pass" && (round.status !== "completed" || round.reviewOutcome !== "pass"))
    ) {
      throw new RecruitingPipelineError("请先确认本次 AI 面试评价通过。", "invalid");
    }
  }
  if (values.effectiveHumanRoundId) {
    if (input.node !== "second_interview" && input.node !== "final_interview") {
      throw new RecruitingPipelineError("真人面试依据只能用于复试或终试。", "invalid");
    }
    const [round] = await tx
      .select()
      .from(humanInterviewRound)
      .where(
        and(
          eq(humanInterviewRound.id, values.effectiveHumanRoundId),
          eq(humanInterviewRound.recruitingRecordId, input.recordId),
          eq(humanInterviewRound.organizationId, input.organizationId),
          eq(humanInterviewRound.roundKind, input.node),
        ),
      );
    if (
      !round ||
      (input.result === "pass" &&
        (round.status !== "completed" || round.outcome !== "pass" || !round.feedback?.trim()))
    ) {
      throw new RecruitingPipelineError("请先完成本轮面试、填写反馈并确认通过。", "invalid");
    }
  }
  if (values.effectiveOfferId) {
    if (input.node !== "offer") {
      throw new RecruitingPipelineError("Offer 依据只能用于谈薪发 Offer 节点。", "invalid");
    }
    const [offer] = await tx
      .select({ id: recruitingOffer.id, status: recruitingOffer.status })
      .from(recruitingOffer)
      .where(
        and(
          eq(recruitingOffer.id, values.effectiveOfferId),
          eq(recruitingOffer.recruitingRecordId, input.recordId),
          eq(recruitingOffer.organizationId, input.organizationId),
        ),
      );
    if (!offer || (input.result === "pass" && offer.status !== "accepted")) {
      throw new RecruitingPipelineError("请先确认本次招聘的 Offer 已被接受。", "invalid");
    }
  }
  if (input.result === "pass" && input.node === "offer" && !values.effectiveOfferId) {
    throw new RecruitingPipelineError("请先选择本次有效 Offer。", "invalid");
  }
  if (
    input.result === "pass" &&
    ((input.node === "ai_interview" && !values.effectiveAiRoundId) ||
      ((input.node === "second_interview" || input.node === "final_interview") &&
        !values.effectiveHumanRoundId))
  ) {
    throw new RecruitingPipelineError("面试通过必须选择本次有效面试轮次。", "invalid");
  }
}

/** 只更新当前有效节点；失败/放弃与关闭记录在同一事务完成。 */
// oxlint-disable-next-line complexity -- 同一事务保留版本、原有效依据、幂等和失败关闭四项竞争保护。
export async function updateRecruitingNodeTx(
  tx: RecruitingTransaction,
  input: RecruitingNodeUpdate,
): Promise<RecruitingPipelineResult> {
  validateNodeProgress(input);
  const record = await lockRecord(tx, input);
  if (requireActive(record) !== input.node) {
    throw new RecruitingPipelineError("该节点已不是当前招聘节点，请刷新后重试。", "conflict");
  }
  const nodes = await loadNodes(tx, input);
  const existing = nodes.find((node) => node.node === input.node);
  const existingEffectiveId =
    existing?.effectiveAiRoundId ?? existing?.effectiveHumanRoundId ?? existing?.effectiveOfferId;
  if (
    input.expectedEffectiveId !== undefined &&
    input.expectedEffectiveId !== existingEffectiveId
  ) {
    throw new RecruitingPipelineError("原面试依据已失效，本次结果仅保留为历史。", "conflict");
  }
  const evidence = {
    effectiveAiRoundId:
      input.effectiveAiRoundId === undefined
        ? (existing?.effectiveAiRoundId ?? null)
        : input.effectiveAiRoundId,
    effectiveHumanRoundId:
      input.effectiveHumanRoundId === undefined
        ? (existing?.effectiveHumanRoundId ?? null)
        : input.effectiveHumanRoundId,
    effectiveOfferId:
      input.effectiveOfferId === undefined
        ? (existing?.effectiveOfferId ?? null)
        : input.effectiveOfferId,
  };
  await validateEvidence(tx, input, evidence);
  if (
    existing?.status === input.status &&
    existing.result === (input.result ?? null) &&
    existing.effectiveAiRoundId === evidence.effectiveAiRoundId &&
    existing.effectiveHumanRoundId === evidence.effectiveHumanRoundId &&
    existing.effectiveOfferId === evidence.effectiveOfferId &&
    existing.reason === (input.reason ?? null)
  ) {
    return result(record, false);
  }
  if (existing?.status === "completed") {
    throw new RecruitingPipelineError("已完成节点需要先回退，才能重新确认结果。", "conflict");
  }
  const now = input.now ?? new Date();
  await putNode(tx, input, input.node, {
    ...evidence,
    completedAt: input.status === "completed" ? now : null,
    decidedAt: input.status === "completed" ? now : null,
    decidedBy: input.status === "completed" ? input.operatorId : null,
    enteredAt: existing?.enteredAt ?? now,
    reason: input.reason ?? null,
    result: input.result ?? null,
    status: input.status,
  });
  if (
    input.result === "fail" ||
    input.result === "withdrawn" ||
    (input.node === "onboarding" && input.result === "pass")
  ) {
    return closeLocked(
      tx,
      {
        ...input,
        closeReason:
          input.result === "pass"
            ? "onboarded"
            : (input.closeReason ?? closeReasonForNode(input.node, input.result)),
        outcome: outcomeForNodeResult(input.result),
      },
      record,
      existing ? [snapshotNode(existing)] : [],
    );
  }
  return writeRecordEvent(tx, input, record, {}, "recruiting_node_updated", {
    node: input.node,
    previousNode: existing ? snapshotNode(existing) : null,
    result: input.result ?? null,
    status: input.status,
    ...evidence,
    reason: input.reason ?? null,
  });
}

/** 人工评价提交与轮次完成复用的当前节点同步；过期轮次只落历史，不推进流程。 */
export async function syncHumanInterviewRoundNodeTx(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand & { roundId: string; outcome: "pass" | "fail" | "inconclusive" },
): Promise<boolean> {
  const record = await lockRecord(tx, input);
  const [round] = await tx
    .select()
    .from(humanInterviewRound)
    .where(
      and(
        eq(humanInterviewRound.id, input.roundId),
        eq(humanInterviewRound.recruitingRecordId, input.recordId),
        eq(humanInterviewRound.organizationId, input.organizationId),
      ),
    );
  if (!round || record.currentStage !== round.roundKind) {
    return false;
  }
  const nodes = await loadNodes(tx, input);
  const node = nodes.find((row) => row.node === round.roundKind);
  if (node?.effectiveHumanRoundId !== input.roundId) {
    return false;
  }
  await updateRecruitingNodeTx(tx, {
    ...input,
    effectiveHumanRoundId: input.roundId,
    expectedEffectiveId: input.roundId,
    node: round.roundKind,
    result: input.outcome === "inconclusive" ? null : input.outcome,
    status: input.outcome === "inconclusive" ? "awaiting_review" : "completed",
  });
  return true;
}

/** 筛选台显式推进：确认合格和进入面试节点必须一并成功，不创建面试轮次。 */
export async function advanceScreeningRecruitingNodeTx(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand & { targetNode: "ai_interview" | "second_interview" },
): Promise<RecruitingPipelineResult> {
  const record = await lockRecord(tx, input);
  if (requireActive(record) !== "screening") {
    throw new RecruitingPipelineError("只有简历筛选阶段可以直接推进面试。", "conflict");
  }
  const nodes = await loadNodes(tx, input);
  const screening = nodes.find((node) => node.node === "screening");
  if (screening && screening.result !== null && screening.result !== "pass") {
    throw new RecruitingPipelineError(
      "筛选未通过的简历不能推进面试，请先回退重新筛选。",
      "invalid",
    );
  }
  const confirmed = await updateRecruitingNodeTx(tx, {
    ...input,
    node: "screening",
    result: "pass",
    status: "completed",
  });
  return transitionRecruitingNodeTx(tx, {
    ...input,
    expectedVersion: confirmed.version,
    reason:
      input.targetNode === "second_interview"
        ? "筛选通过后直接安排复试，明确跳过 AI 初面"
        : undefined,
    skipNodes: input.targetNode === "second_interview" ? ["ai_interview"] : [],
  });
}
