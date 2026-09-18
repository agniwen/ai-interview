/* oxlint-disable complexity, curly, no-nested-ternary, require-await, sort-keys, typescript/no-non-null-assertion -- Approval commands intentionally keep each transactional state transition together. */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  recruitingRecord,
  recruitingOffer,
  recruitingOfferApproval,
  recruitingOfferApprovalStep,
  recruitingNotificationEvent,
  recruitingNotificationDelivery,
} from "@app/db-schema/schema";
import {
  submitOfferApprovalSchema,
  offerApprovalDecisionSchema,
  offerApprovalWithdrawSchema,
  offerApprovalNotificationSchema,
} from "@app/shared/offer-approval";
import type { z } from "zod";
import {
  cancelApprovalRemindersTx,
  enqueueApprovalNotificationTx,
  recordApprovalEventTx,
  approvalEventIdentity,
} from "@app/database/offer-approval";
import { db } from "../../../../../../lib/server/db";
import {
  assertApprovalPermission,
  assertRecordManager,
  assertCurrentDraft,
  assertOfferDates,
  hashRequest,
  loadOfferSnapshot,
  lockApproval,
  lockOffer,
  OfferApprovalError,
  readReceipt,
  saveReceipt,
} from "../dao";
import type { Actor } from "../dao";

export const defaultOfferApprovalCommandDependencies = {
  db,
  assertApprovalPermission,
  assertCurrentDraft,
  assertRecordManager,
  cancelApprovalRemindersTx,
  enqueueApprovalNotificationTx,
  lockApproval,
  readReceipt,
  recordApprovalEventTx,
  saveReceipt,
};
export type OfferApprovalCommandDependencies = Omit<
  typeof defaultOfferApprovalCommandDependencies,
  "db"
> & {
  db: Pick<typeof db, "transaction">;
};

export async function submitOfferApproval(
  actor: Actor,
  raw: z.input<typeof submitOfferApprovalSchema>,
) {
  const input = submitOfferApprovalSchema.parse(raw);
  const requestHash = hashRequest({ command: "submit", ...input });
  return db.transaction(async (tx) => {
    const { record, offer } = await lockOffer(tx, actor, input.offerId);
    const applicant = await assertRecordManager(tx, actor, record, "create");
    if (input.recruitingRecordId !== record.id) {
      throw new OfferApprovalError("Offer 不属于该招聘记录", 404);
    }
    const receipt = await readReceipt(tx, actor, input.requestId, requestHash);
    if (receipt) {
      return { approvalId: receipt.approvalId };
    }
    await assertCurrentDraft(tx, record, offer);
    const snapshot = await loadOfferSnapshot(tx, offer);
    const snapshotHash = hashRequest(snapshot);
    if (
      input.expectedContentRevision !== offer.contentRevision ||
      input.expectedSnapshotHash !== snapshotHash
    ) {
      throw new OfferApprovalError("Offer 内容已变化，请刷新并重新核对");
    }
    assertOfferDates(snapshot, new Date(), true);
    const approvers = [];
    for (const userId of input.approverIds) {
      if (userId === actor.userId) {
        throw new OfferApprovalError("不能审批自己发起的申请", 400);
      }
      const person = await assertApprovalPermission(tx, { ...actor, userId }, "decide");
      await assertApprovalPermission(tx, { ...actor, userId }, "read");
      approvers.push({ name: person.name, userId });
    }
    const history = await tx
      .select()
      .from(recruitingOfferApproval)
      .where(eq(recruitingOfferApproval.recruitingRecordId, record.id))
      .orderBy(desc(recruitingOfferApproval.attemptNumber))
      .for("update");
    if (history.some((item) => item.status === "pending")) {
      throw new OfferApprovalError("本次招聘已有审批中的申请");
    }
    if (
      history.some(
        (item) =>
          item.id === offer.currentApprovalId &&
          item.status === "approved" &&
          !item.invalidatedAt &&
          item.snapshotHash === snapshotHash,
      )
    ) {
      throw new OfferApprovalError("当前内容已审批通过，可确认发布");
    }
    const now = new Date();
    // Dependency identity changes also become a new revision; the old approval remains historical.
    const previous = history.find((item) => item.id === offer.currentApprovalId);
    const contentRevision =
      offer.contentRevision +
      (previous &&
      previous.contentRevision === offer.contentRevision &&
      previous.snapshotHash !== snapshotHash
        ? 1
        : 0);
    if (previous?.status === "approved" && !previous.invalidatedAt) {
      await tx
        .update(recruitingOfferApproval)
        .set({ invalidatedAt: now, invalidationReason: "重新提交审批" })
        .where(eq(recruitingOfferApproval.id, previous.id));
      await recordApprovalEventTx(tx, previous, "offer_approval_invalidated", actor.userId, {
        reason: "重新提交审批",
      });
    }
    const [approval] = await tx
      .insert(recruitingOfferApproval)
      .values({
        applicantId: actor.userId,
        applicantName: applicant.name,
        attemptNumber: (history[0]?.attemptNumber ?? 0) + 1,
        contentRevision,
        createdAt: now,
        id: crypto.randomUUID(),
        offerId: offer.id,
        organizationId: actor.organizationId,
        previousApprovalId: history[0]?.id ?? null,
        reason: input.reason,
        recruitingRecordId: record.id,
        snapshot,
        snapshotHash,
      })
      .returning();
    const steps = await tx
      .insert(recruitingOfferApprovalStep)
      .values(
        approvers.map((person, position) => ({
          activatedAt: position === 0 ? now : null,
          approvalId: approval.id,
          approverId: person.userId,
          approverName: person.name,
          id: crypto.randomUUID(),
          organizationId: actor.organizationId,
          position,
          recruitingRecordId: record.id,
          status: position === 0 ? ("pending" as const) : ("waiting" as const),
        })),
      )
      .returning();
    await tx
      .update(recruitingRecord)
      .set({ offerApprovalRequiredAt: record.offerApprovalRequiredAt ?? now })
      .where(eq(recruitingRecord.id, record.id));
    await tx
      .update(recruitingOffer)
      .set({ contentRevision, currentApprovalId: approval.id })
      .where(eq(recruitingOffer.id, offer.id));
    await recordApprovalEventTx(tx, approval, "offer_approval_submitted", actor.userId);
    const first = steps.find((step) => step.position === 0)!;
    await enqueueApprovalNotificationTx(tx, approval, {
      actionId: "activated",
      now,
      recipientUserId: first.approverId,
      stepId: first.id,
      type: "offer_approval_pending",
    });
    await saveReceipt(tx, actor, input.requestId, requestHash, approval.id);
    return { approvalId: approval.id };
  });
}

export async function decideOfferApproval(
  actor: Actor,
  approvalId: string,
  stepId: string,
  raw: z.input<typeof offerApprovalDecisionSchema>,
  dependencies: OfferApprovalCommandDependencies = defaultOfferApprovalCommandDependencies,
) {
  const input = offerApprovalDecisionSchema.parse(raw);
  const requestHash = hashRequest({ approvalId, command: "decide", stepId, ...input });
  return dependencies.db.transaction(async (tx) => {
    const { record, offer, approval, steps } = await dependencies.lockApproval(
      tx,
      actor,
      approvalId,
    );
    await dependencies.assertApprovalPermission(tx, actor, "read");
    await dependencies.assertApprovalPermission(tx, actor, "decide");
    const step = steps.find((item) => item.id === stepId);
    if (!step || step.approverId !== actor.userId || approval.applicantId === actor.userId) {
      throw new OfferApprovalError("只有当前指定审批人可以处理", 403);
    }
    const receipt = await dependencies.readReceipt(tx, actor, input.requestId, requestHash);
    if (receipt) {
      return { approvalId: receipt.approvalId };
    }
    await dependencies.assertCurrentDraft(tx, record, offer);
    if (
      approval.status !== "pending" ||
      approval.invalidatedAt ||
      step.status !== "pending" ||
      approval.currentStep !== step.position ||
      offer.currentApprovalId !== approval.id
    ) {
      throw new OfferApprovalError("审批节点已变化，请刷新查看结果");
    }
    const now = new Date();
    await tx
      .update(recruitingOfferApprovalStep)
      .set({ comment: input.comment || null, decidedAt: now, status: input.decision })
      .where(eq(recruitingOfferApprovalStep.id, stepId));
    await dependencies.cancelApprovalRemindersTx(tx, approvalId, now);
    const next = steps.find((item) => item.position === step.position + 1);
    const finalStatus = input.decision === "rejected" ? "rejected" : next ? "pending" : "approved";
    await tx
      .update(recruitingOfferApproval)
      .set({
        completedAt: finalStatus === "pending" ? null : now,
        currentStep: finalStatus === "pending" ? next!.position : step.position,
        // A newly activated node/result has its own notification rate-limit window.
        lastRemindedAt: null,
        status: finalStatus,
      })
      .where(eq(recruitingOfferApproval.id, approvalId));
    await dependencies.recordApprovalEventTx(
      tx,
      approval,
      `offer_approval_step_${input.decision}`,
      actor.userId,
      { stepId },
    );
    if (finalStatus === "pending" && next) {
      await tx
        .update(recruitingOfferApprovalStep)
        .set({ activatedAt: now, status: "pending" })
        .where(eq(recruitingOfferApprovalStep.id, next.id));
      // Unavailable members stay pending and are shown as blocked; they are never silently skipped.
      await dependencies.enqueueApprovalNotificationTx(tx, approval, {
        actionId: "activated",
        now,
        recipientUserId: next.approverId,
        stepId: next.id,
        type: "offer_approval_pending",
      });
    } else {
      await tx
        .update(recruitingOfferApprovalStep)
        .set({ status: "cancelled" })
        .where(
          and(
            eq(recruitingOfferApprovalStep.approvalId, approvalId),
            eq(recruitingOfferApprovalStep.status, "waiting"),
          ),
        );
      await dependencies.recordApprovalEventTx(
        tx,
        approval,
        `offer_approval_${finalStatus}`,
        actor.userId,
      );
      await dependencies.enqueueApprovalNotificationTx(
        tx,
        { ...approval, status: finalStatus },
        {
          actionId: "completed",
          now,
          recipientUserId: approval.applicantId,
          type: "offer_approval_result",
        },
      );
    }
    await dependencies.saveReceipt(tx, actor, input.requestId, requestHash, approvalId);
    return { approvalId };
  });
}

export async function withdrawOfferApproval(
  actor: Actor,
  approvalId: string,
  raw: z.input<typeof offerApprovalWithdrawSchema>,
) {
  const input = offerApprovalWithdrawSchema.parse(raw);
  const requestHash = hashRequest({ approvalId, command: "withdraw", ...input });
  return db.transaction(async (tx) => {
    const { record, approval, steps } = await lockApproval(tx, actor, approvalId);
    await assertRecordManager(
      tx,
      actor,
      record,
      approval.applicantId === actor.userId ? "create" : "manage",
    );
    const receipt = await readReceipt(tx, actor, input.requestId, requestHash);
    if (receipt) {
      return { approvalId: receipt.approvalId };
    }
    if (approval.status !== "pending") {
      throw new OfferApprovalError("审批已结束；已通过的内容请使用确认失效并编辑");
    }
    const now = new Date();
    await tx
      .update(recruitingOfferApproval)
      .set({ completedAt: now, status: "withdrawn", withdrawalReason: input.reason })
      .where(eq(recruitingOfferApproval.id, approvalId));
    await tx
      .update(recruitingOfferApprovalStep)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(recruitingOfferApprovalStep.approvalId, approvalId),
          inArray(recruitingOfferApprovalStep.status, ["waiting", "pending"]),
        ),
      );
    await cancelApprovalRemindersTx(tx, approvalId, now);
    for (const step of steps.filter((item) => item.activatedAt)) {
      await enqueueApprovalNotificationTx(
        tx,
        { ...approval, status: "withdrawn" },
        {
          type: "offer_approval_cancelled",
          recipientUserId: step.approverId,
          stepId: step.id,
          actionId: "withdrawn",
          now,
        },
      );
    }
    await recordApprovalEventTx(tx, approval, "offer_approval_withdrawn", actor.userId, {
      reason: input.reason,
    });
    await saveReceipt(tx, actor, input.requestId, requestHash, approvalId);
    return { approvalId };
  });
}

export async function notifyOfferApproval(
  actor: Actor,
  approvalId: string,
  kind: "remind" | "retry",
  raw: z.input<typeof offerApprovalNotificationSchema>,
  dependencies: OfferApprovalCommandDependencies = defaultOfferApprovalCommandDependencies,
) {
  const input = offerApprovalNotificationSchema.parse(raw);
  const requestHash = hashRequest({ approvalId, command: kind, ...input });
  return dependencies.db.transaction(async (tx) => {
    const { record, approval, steps } = await dependencies.lockApproval(tx, actor, approvalId);
    await dependencies.assertRecordManager(
      tx,
      actor,
      record,
      approval.applicantId === actor.userId ? "create" : "manage",
    );
    const receipt = await dependencies.readReceipt(tx, actor, input.requestId, requestHash);
    if (receipt) {
      return { approvalId: receipt.approvalId };
    }
    const now = new Date();
    if (
      approval.lastRemindedAt &&
      now.getTime() - approval.lastRemindedAt.getTime() < 30 * 60 * 1000
    ) {
      throw new OfferApprovalError("同一审批每 30 分钟最多再次通知一次");
    }
    const step = steps.find((item) => item.status === "pending");
    let type: "offer_approval_pending" | "offer_approval_result" = "offer_approval_pending";
    let recipientUserId = step?.approverId;
    if (kind === "retry") {
      if (!input.eventId) {
        throw new OfferApprovalError("请选择失败通知", 400);
      }
      const [event] = await tx
        .select()
        .from(recruitingNotificationEvent)
        .where(
          and(eq(recruitingNotificationEvent.id, input.eventId), approvalEventIdentity(approvalId)),
        );
      if (
        !event ||
        !["dead", "failed", "isolated_dead", "isolated_failed"].includes(event.status)
      ) {
        throw new OfferApprovalError("通知不可重发");
      }
      const deliveries = await tx
        .select()
        .from(recruitingNotificationDelivery)
        .where(eq(recruitingNotificationDelivery.eventId, event.id))
        .for("update");
      if (deliveries.some((item) => ["unknown", "sending", "sent"].includes(item.status))) {
        throw new OfferApprovalError("通知已发送或发送结果未知，须先核查，不能直接重发");
      }
      if (
        event.type === "offer_approval_result" &&
        ["approved", "rejected"].includes(approval.status)
      ) {
        type = "offer_approval_result";
        recipientUserId = approval.applicantId;
      } else if (
        event.type !== "offer_approval_pending" ||
        event.payloadSnapshot.offerApproval?.stepId !== step?.id
      ) {
        throw new OfferApprovalError("旧通知已不适用当前节点");
      }
      await tx
        .update(recruitingNotificationEvent)
        .set({ leaseExpiresAt: null, leaseOwner: null, status: "cancelled" })
        .where(eq(recruitingNotificationEvent.id, event.id));
      await tx
        .update(recruitingNotificationDelivery)
        .set({ leaseExpiresAt: null, leaseOwner: null, nextAttemptAt: null, status: "cancelled" })
        .where(
          and(
            eq(recruitingNotificationDelivery.eventId, event.id),
            inArray(recruitingNotificationDelivery.status, ["pending", "failed", "dead"]),
          ),
        );
    }
    if (
      type === "offer_approval_pending" &&
      (approval.status !== "pending" || !step || approval.invalidatedAt)
    ) {
      throw new OfferApprovalError("当前无待审批节点");
    }
    if (!recipientUserId) {
      throw new OfferApprovalError("通知接收人不可用");
    }
    await dependencies.enqueueApprovalNotificationTx(tx, approval, {
      actionId: input.requestId,
      now,
      recipientUserId,
      stepId: type === "offer_approval_pending" ? step?.id : undefined,
      type,
    });
    await tx
      .update(recruitingOfferApproval)
      .set({ lastRemindedAt: now })
      .where(eq(recruitingOfferApproval.id, approvalId));
    await dependencies.recordApprovalEventTx(
      tx,
      approval,
      kind === "remind" ? "offer_approval_reminded" : "offer_approval_notification_retried",
      actor.userId,
    );
    await dependencies.saveReceipt(tx, actor, input.requestId, requestHash, approvalId);
    return { approvalId };
  });
}
