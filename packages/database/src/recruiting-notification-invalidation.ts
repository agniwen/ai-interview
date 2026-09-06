import { and, eq, inArray, or } from "drizzle-orm";
import {
  aiInterviewRound,
  humanInterviewRound,
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
} from "@app/db-schema/schema";
import type { RecruitingNode } from "@app/db-schema/schema";
import type { RecruitingPipelineCommand, RecruitingTransaction } from "./recruiting-pipeline";

/** 回退后取消失效节点所有旧排期的待发通知，保留已发送记录和原始轮次。 */
export async function invalidateRecruitingNodeNotificationsTx(
  tx: RecruitingTransaction,
  input: RecruitingPipelineCommand,
  nodes: readonly RecruitingNode[],
): Promise<string[]> {
  const aiRounds = tx
    .select({ id: aiInterviewRound.id })
    .from(aiInterviewRound)
    .where(
      and(
        eq(aiInterviewRound.recruitingRecordId, input.recordId),
        eq(aiInterviewRound.organizationId, input.organizationId),
      ),
    );
  const humanNodes = nodes.filter(
    (node) => node === "second_interview" || node === "final_interview",
  );
  const humanRounds = tx
    .select({ id: humanInterviewRound.id })
    .from(humanInterviewRound)
    .where(
      and(
        eq(humanInterviewRound.recruitingRecordId, input.recordId),
        eq(humanInterviewRound.organizationId, input.organizationId),
        inArray(humanInterviewRound.roundKind, humanNodes),
      ),
    );
  const scope = or(
    nodes.includes("ai_interview")
      ? inArray(recruitingNotificationEvent.aiRoundId, aiRounds)
      : undefined,
    humanNodes.length > 0
      ? inArray(recruitingNotificationEvent.humanRoundId, humanRounds)
      : undefined,
  );
  if (!scope) {
    return [];
  }
  const now = input.now ?? new Date();
  const cancelled = await tx
    .update(recruitingNotificationEvent)
    .set({
      completedAt: now,
      lastErrorMessage: "招聘流程已回到之前节点，旧排期失效",
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "cancelled",
      updatedAt: now,
    })
    .where(
      and(
        eq(recruitingNotificationEvent.organizationId, input.organizationId),
        scope,
        inArray(recruitingNotificationEvent.status, ["pending", "processing", "failed"]),
      ),
    )
    .returning({ id: recruitingNotificationEvent.id });
  const ids = cancelled.map((row) => row.id);
  if (ids.length > 0) {
    await tx
      .update(recruitingNotificationDelivery)
      .set({
        leaseExpiresAt: null,
        leaseOwner: null,
        nextAttemptAt: null,
        status: "cancelled",
        updatedAt: now,
      })
      .where(
        and(
          eq(recruitingNotificationDelivery.organizationId, input.organizationId),
          inArray(recruitingNotificationDelivery.eventId, ids),
          inArray(recruitingNotificationDelivery.status, ["pending", "failed", "sending"]),
        ),
      );
  }
  return ids;
}
