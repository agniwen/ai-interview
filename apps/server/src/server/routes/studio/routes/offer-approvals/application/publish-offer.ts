/* oxlint-disable sort-keys -- The audit payload groups the Offer identity with its approval evidence. */
import { and, eq } from "drizzle-orm";
import {
  recruitingOffer,
  recruitingOfferApproval,
  recruitingOfferApprovalStep,
  recruitingEvent,
} from "@app/db-schema/schema";
import type { recruitingRecord } from "@app/db-schema/schema";
import type { RecruitingTransaction as Tx } from "@app/database/recruiting-records";
import { updateRecruitingNodeTx } from "@app/database/recruiting-pipeline";
import { hasPermissionInStatements } from "@app/shared/permission-statements";
import {
  approvalMember,
  assertCurrentDraft,
  assertOfferDates,
  hashRequest,
  loadOfferSnapshot,
  OfferApprovalError,
  recordIsVisible,
} from "../dao";

/** Both creation-with-publication and normal publication call this action while holding record then Offer locks. */
export async function publishOfferTx(
  tx: Tx,
  record: typeof recruitingRecord.$inferSelect,
  offer: typeof recruitingOffer.$inferSelect,
  operatorId: string | null,
) {
  if (!operatorId) {
    throw new OfferApprovalError("请登录后发布 Offer", 403);
  }
  const actor = { organizationId: record.organizationId, userId: operatorId };
  const person = await approvalMember(tx, actor);
  if (
    !hasPermissionInStatements(person.statements, "offer", "update") ||
    !(await recordIsVisible(actor, record, person.role))
  ) {
    throw new OfferApprovalError("没有此 Offer 的发布权限", 403);
  }
  // A retry returns the persisted identity. It cannot create another public link.
  if (offer.publishedAt && offer.publicToken && offer.status !== "superseded") {
    return offer;
  }
  await assertCurrentDraft(tx, record, offer);
  const snapshot = await loadOfferSnapshot(tx, offer);
  const now = new Date();
  assertOfferDates(snapshot, now, !!record.offerApprovalRequiredAt);
  let approvalId: string | null = null;
  if (record.offerApprovalRequiredAt) {
    const [approval] = offer.currentApprovalId
      ? await tx
          .select()
          .from(recruitingOfferApproval)
          .where(
            and(
              eq(recruitingOfferApproval.id, offer.currentApprovalId),
              eq(recruitingOfferApproval.offerId, offer.id),
              eq(recruitingOfferApproval.organizationId, record.organizationId),
            ),
          )
          .for("update")
      : [];
    if (
      !approval ||
      approval.status !== "approved" ||
      approval.invalidatedAt ||
      approval.contentRevision !== offer.contentRevision ||
      approval.snapshotHash !== hashRequest(snapshot)
    ) {
      throw new OfferApprovalError("本次招聘须由当前 Offer 内容审批通过后才能发布");
    }
    const steps = await tx
      .select()
      .from(recruitingOfferApprovalStep)
      .where(eq(recruitingOfferApprovalStep.approvalId, approval.id))
      .for("update");
    if (!steps.length || steps.some((step) => step.status !== "approved")) {
      throw new OfferApprovalError("审批尚未全部通过");
    }
    approvalId = approval.id;
  }
  const [published] = await tx
    .update(recruitingOffer)
    .set({
      publicToken: crypto.randomUUID(),
      publishedApprovalId: approvalId,
      publishedAt: now,
      publishedBy: operatorId,
      publishedSnapshot: snapshot,
      sentAt: now,
      status: "sent",
      updatedAt: now,
    })
    .where(eq(recruitingOffer.id, offer.id))
    .returning();
  await updateRecruitingNodeTx(tx, {
    effectiveOfferId: offer.id,
    expectedEffectiveId: offer.id,
    node: "offer",
    now,
    operatorId,
    organizationId: record.organizationId,
    recordId: record.id,
    status: "awaiting_response",
  });
  await tx.insert(recruitingEvent).values({
    action: "offer_publication_authorized",
    detail: { approvalId, contentRevision: offer.contentRevision, offerId: offer.id },
    id: crypto.randomUUID(),
    operatorId,
    organizationId: record.organizationId,
    recruitingRecordId: record.id,
  });
  return published;
}
