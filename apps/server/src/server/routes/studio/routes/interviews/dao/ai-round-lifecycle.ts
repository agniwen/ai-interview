import { and, asc, eq, inArray } from "drizzle-orm";
import {
  aiInterviewConversation,
  aiInterviewRound,
  recruitingContextSnapshot,
  recruitingEvidenceSnapshot,
  recruitingEvent,
  recruitingNodeState,
  recruitingNotificationEvent,
  recruitingNotificationDelivery,
} from "@app/db-schema/schema";
import { lockRecruitingRecord } from "@app/database/recruiting-records";
import type { RecruitingTransaction } from "@app/database/recruiting-records";
import {
  reopenRecruitingRecordTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";

/** 先锁招聘再锁轮次，和推进/回退使用同一顺序；公共旧邀请不能恢复失效依据。 */
export async function lockAiRound(
  tx: RecruitingTransaction,
  roundId: string,
  organizationId?: string,
) {
  const [identity] = await tx
    .select({
      organizationId: aiInterviewRound.organizationId,
      recordId: aiInterviewRound.recruitingRecordId,
    })
    .from(aiInterviewRound)
    .where(
      and(
        eq(aiInterviewRound.id, roundId),
        organizationId ? eq(aiInterviewRound.organizationId, organizationId) : undefined,
      ),
    );
  if (!identity) {
    return null;
  }
  const record = await lockRecruitingRecord(tx, identity.recordId, identity.organizationId);
  if (!record) {
    return null;
  }
  const [round] = await tx
    .select()
    .from(aiInterviewRound)
    .where(
      and(eq(aiInterviewRound.id, roundId), eq(aiInterviewRound.recruitingRecordId, record.id)),
    )
    .for("update");
  if (!round) {
    return null;
  }
  const [node] = await tx
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, record.id),
        eq(recruitingNodeState.node, "ai_interview"),
      ),
    );
  return {
    isEffective: record.currentStage === "ai_interview" && node?.effectiveAiRoundId === round.id,
    node,
    record,
    round,
  };
}

/** 迟到回调可以保留报告，但不应把已经失效的历史轮次恢复为当前状态。 */
export async function updateEffectiveAiProgress(
  tx: RecruitingTransaction,
  roundId: string,
  status: "in_progress" | "awaiting_review",
) {
  const locked = await lockAiRound(tx, roundId);
  if (
    !locked?.isEffective ||
    locked.node?.status === "completed" ||
    locked.node?.status === "skipped" ||
    Boolean(locked.node?.result)
  ) {
    return false;
  }
  await updateRecruitingNodeTx(tx, {
    effectiveAiRoundId: roundId,
    expectedEffectiveId: roundId,
    node: "ai_interview",
    operatorId: null,
    organizationId: locked.record.organizationId,
    recordId: locked.record.id,
    status,
  });
  return true;
}

/** 删除轮次前解除复合引用；会话、快照和已产生的操作历史继续保留。 */
export async function deleteAiRounds(
  tx: RecruitingTransaction,
  ids: string[],
  organizationId: string,
  operatorId: string | null,
) {
  const targets = await tx
    .select({ id: aiInterviewRound.id, recordId: aiInterviewRound.recruitingRecordId })
    .from(aiInterviewRound)
    .where(
      and(inArray(aiInterviewRound.id, ids), eq(aiInterviewRound.organizationId, organizationId)),
    )
    .orderBy(asc(aiInterviewRound.recruitingRecordId), asc(aiInterviewRound.id));
  for (const target of targets) {
    const locked = await lockAiRound(tx, target.id, organizationId);
    if (!locked) {
      continue;
    }
    if (
      locked.record.currentStage !== "screening" &&
      locked.record.currentStage !== "ai_interview"
    ) {
      return { kind: "locked" } as const;
    }
  }
  const removed: { interviewRecordId: string }[] = [];
  for (const target of targets) {
    const locked = await lockAiRound(tx, target.id, organizationId);
    if (!locked) {
      continue;
    }
    if (locked.isEffective) {
      await reopenRecruitingRecordTx(tx, {
        operatorId,
        organizationId,
        reason: "删除当前 AI 面试轮次",
        recordId: target.recordId,
        targetNode: "ai_interview",
      });
    }
    await tx
      .update(aiInterviewRound)
      .set({ conversationId: null })
      .where(eq(aiInterviewRound.id, target.id));
    await tx
      .update(aiInterviewConversation)
      .set({ aiRoundId: null })
      .where(eq(aiInterviewConversation.aiRoundId, target.id));
    await tx
      .update(recruitingEvidenceSnapshot)
      .set({ aiRoundId: null })
      .where(eq(recruitingEvidenceSnapshot.aiRoundId, target.id));
    await tx
      .update(recruitingContextSnapshot)
      .set({ aiRoundId: null })
      .where(eq(recruitingContextSnapshot.aiRoundId, target.id));
    await tx
      .update(recruitingNotificationEvent)
      .set({
        aiRoundId: null,
        completedAt: new Date(),
        lastErrorMessage: "面试轮次已删除",
        status: "cancelled",
      })
      .where(
        and(
          eq(recruitingNotificationEvent.aiRoundId, target.id),
          inArray(recruitingNotificationEvent.status, ["pending", "processing", "failed"]),
        ),
      );
    const cancelledEvents = tx
      .select({ id: recruitingNotificationEvent.id })
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.recruitingRecordId, target.recordId),
          eq(recruitingNotificationEvent.status, "cancelled"),
        ),
      );
    await tx
      .update(recruitingNotificationDelivery)
      .set({
        leaseExpiresAt: null,
        leaseOwner: null,
        nextAttemptAt: null,
        status: "cancelled",
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(recruitingNotificationDelivery.eventId, cancelledEvents),
          inArray(recruitingNotificationDelivery.status, ["pending", "failed", "sending"]),
        ),
      );
    await tx
      .update(recruitingNotificationEvent)
      .set({ aiRoundId: null })
      .where(eq(recruitingNotificationEvent.aiRoundId, target.id));
    await tx
      .update(recruitingEvent)
      .set({ aiRoundId: null })
      .where(eq(recruitingEvent.aiRoundId, target.id));
    await tx.delete(aiInterviewRound).where(eq(aiInterviewRound.id, target.id));
    removed.push({ interviewRecordId: target.recordId });
    const remaining = await tx
      .select({ id: aiInterviewRound.id })
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.recruitingRecordId, target.recordId))
      .limit(1);
    if (!remaining.length && locked.record.currentStage === "ai_interview") {
      await reopenRecruitingRecordTx(tx, {
        operatorId,
        organizationId,
        reason: "最后一个 AI 面试轮次已删除",
        recordId: target.recordId,
        targetNode: "screening",
      });
    }
  }
  return { kind: "ok", removed } as const;
}
