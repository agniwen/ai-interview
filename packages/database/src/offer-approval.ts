/* oxlint-disable anti-slop/no-conditional-empty-object-spread, curly, no-shadow, sort-keys -- These helpers preserve atomic approval history, including conditionally cancelled rows. */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  recruitingOffer,
  recruitingOfferApproval,
  recruitingOfferApprovalStep,
  recruitingNotificationEvent,
  recruitingNotificationDelivery,
  recruitingEvent,
} from "@app/db-schema/schema";
import {
  interviewNotificationEventStatusForQueue,
  parseInterviewNotificationQueueNamespace,
} from "@app/db-schema/interview-notifications";
import type { RecruitingTransaction } from "./recruiting-records";

type Approval = typeof recruitingOfferApproval.$inferSelect;
export async function recordApprovalEventTx(
  tx: RecruitingTransaction,
  approval: Approval,
  action: string,
  actorId: string | null,
  detail: Record<string, string | number | null> = {},
) {
  await tx.insert(recruitingEvent).values({
    id: crypto.randomUUID(),
    organizationId: approval.organizationId,
    recruitingRecordId: approval.recruitingRecordId,
    operatorId: actorId,
    action,
    detail: {
      approvalId: approval.id,
      attemptNumber: approval.attemptNumber,
      contentRevision: approval.contentRevision,
      ...detail,
    },
  });
}

/** Persist a minimal outbox payload. Worker resolves the current application identity before sending. */
export async function enqueueApprovalNotificationTx(
  tx: RecruitingTransaction,
  approval: Approval,
  input: {
    type: "offer_approval_pending" | "offer_approval_result" | "offer_approval_cancelled";
    recipientUserId: string;
    stepId?: string;
    actionId: string;
    now: Date;
  },
) {
  const queueNamespace = parseInterviewNotificationQueueNamespace(
    process.env.INTERVIEW_NOTIFICATION_QUEUE_NAMESPACE,
  );
  await tx
    .insert(recruitingNotificationEvent)
    .values({
      id: crypto.randomUUID(),
      organizationId: approval.organizationId,
      recruitingRecordId: approval.recruitingRecordId,
      scopeType: "offer_approval",
      type: input.type,
      queueNamespace,
      status: interviewNotificationEventStatusForQueue(queueNamespace, "pending"),
      dedupeKey: `offer-approval:${approval.id}:${input.stepId ?? "result"}:${input.type}:${input.actionId}:${input.recipientUserId}`,
      availableAt: input.now,
      nextAttemptAt: input.now,
      payloadSnapshot: {
        schemaVersion: 1,
        timeZone: "Asia/Shanghai",
        candidateName: approval.snapshot.candidateName,
        jobName: approval.snapshot.position,
        initiatorName: approval.applicantName,
        offerApproval: {
          approvalId: approval.id,
          stepId: input.stepId ?? null,
          recipientUserId: input.recipientUserId,
          status: approval.status,
        },
      },
    })
    .onConflictDoNothing();
}

export function approvalEventIdentity(approvalId: string) {
  return sql`${recruitingNotificationEvent.payloadSnapshot}->'offerApproval'->>'approvalId' = ${approvalId}`;
}

export async function cancelApprovalRemindersTx(
  tx: RecruitingTransaction,
  approvalId: string,
  now: Date,
) {
  const events = await tx
    .select({ id: recruitingNotificationEvent.id })
    .from(recruitingNotificationEvent)
    .where(
      and(
        eq(recruitingNotificationEvent.scopeType, "offer_approval"),
        eq(recruitingNotificationEvent.type, "offer_approval_pending"),
        // JSON identity is persisted with the event, so ordinary and isolated queues are both covered.
        // Parameterized JSON extraction avoids dynamic SQL identifiers.
        approvalEventIdentity(approvalId),
      ),
    );
  if (!events.length) return;
  const ids = events.map((event) => event.id);
  await tx
    .update(recruitingNotificationEvent)
    .set({ status: "cancelled", leaseOwner: null, leaseExpiresAt: null, updatedAt: now })
    .where(
      and(
        inArray(recruitingNotificationEvent.id, ids),
        inArray(recruitingNotificationEvent.status, [
          "pending",
          "processing",
          "failed",
          "dead",
          "isolated_pending",
          "isolated_processing",
          "isolated_failed",
          "isolated_dead",
        ]),
      ),
    );
  await tx
    .update(recruitingNotificationDelivery)
    .set({
      status: "cancelled",
      leaseOwner: null,
      leaseExpiresAt: null,
      nextAttemptAt: null,
      updatedAt: now,
    })
    .where(
      and(
        inArray(recruitingNotificationDelivery.eventId, ids),
        // In-flight requests keep their lease so the Worker can persist sent/unknown results.
        // The cancelled event prevents any subsequent claim or retry of the old reminder.
        inArray(recruitingNotificationDelivery.status, ["pending", "failed", "dead"]),
      ),
    );
}

/** Caller holds recruiting record lock. Always locks Offer before approval, then steps. */
export async function invalidateOfferApprovalsTx(
  tx: RecruitingTransaction,
  input: {
    recordId: string;
    organizationId: string;
    reason: string;
    operatorId: string | null;
    now?: Date;
    offerId?: string;
  },
) {
  const now = input.now ?? new Date();
  await tx
    .select({ id: recruitingOffer.id })
    .from(recruitingOffer)
    .where(
      and(
        eq(recruitingOffer.recruitingRecordId, input.recordId),
        eq(recruitingOffer.organizationId, input.organizationId),
      ),
    )
    .for("update");
  const approvals = await tx
    .select()
    .from(recruitingOfferApproval)
    .where(
      and(
        eq(recruitingOfferApproval.recruitingRecordId, input.recordId),
        eq(recruitingOfferApproval.organizationId, input.organizationId),
        input.offerId ? eq(recruitingOfferApproval.offerId, input.offerId) : undefined,
        isNull(recruitingOfferApproval.invalidatedAt),
        inArray(recruitingOfferApproval.status, ["pending", "approved"]),
      ),
    )
    .for("update");
  for (const approval of approvals) {
    const [offer] = await tx
      .select()
      .from(recruitingOffer)
      .where(eq(recruitingOffer.id, approval.offerId));
    if (offer?.publishedApprovalId === approval.id) {
      continue;
    }
    await tx
      .update(recruitingOfferApproval)
      .set({
        invalidatedAt: now,
        invalidationReason: input.reason,
        ...(approval.status === "pending"
          ? { completedAt: now, status: "cancelled" as const }
          : {}),
      })
      .where(eq(recruitingOfferApproval.id, approval.id));
    const steps = await tx
      .select()
      .from(recruitingOfferApprovalStep)
      .where(eq(recruitingOfferApprovalStep.approvalId, approval.id))
      .for("update");
    await tx
      .update(recruitingOfferApprovalStep)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(recruitingOfferApprovalStep.approvalId, approval.id),
          inArray(recruitingOfferApprovalStep.status, ["waiting", "pending"]),
        ),
      );
    await cancelApprovalRemindersTx(tx, approval.id, now);
    for (const step of steps.filter((step) => step.activatedAt)) {
      await enqueueApprovalNotificationTx(
        tx,
        { ...approval, status: "cancelled" },
        {
          actionId: "invalidated",
          now,
          recipientUserId: step.approverId,
          stepId: step.id,
          type: "offer_approval_cancelled",
        },
      );
    }
    await recordApprovalEventTx(tx, approval, "offer_approval_invalidated", input.operatorId, {
      reason: input.reason,
    });
  }
}
