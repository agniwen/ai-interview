/* oxlint-disable complexity, curly, no-nested-ternary, require-await -- Approval reads compute visibility and current-assignee state from several persisted relations. */
import { and, count, desc, eq, exists, inArray, or, sql } from "drizzle-orm";
import {
  recruitingRecord,
  recruitingOfferApproval as approvalTable,
  recruitingOfferApprovalStep as stepTable,
  recruitingNotificationEvent,
  recruitingNotificationDelivery,
} from "@app/db-schema/schema";
import { hasPermissionInStatements } from "@app/shared/permission-statements";
import { approvalEventIdentity } from "@app/database/offer-approval";
import { db } from "../../../../../../lib/server/db";
import { resolveRecruitingVisibilityScope } from "../../../../../access/recruiting-visibility";
import {
  assertApprovalPermission,
  assertRecordManager,
  loadOfferSnapshot,
  hashRequest,
  lockOffer,
  OfferApprovalError,
  recordIsVisible,
} from "../dao";
import type { Actor } from "../dao";
import { resolveEnabledTemplatesForPreview } from "./templates";

async function unavailableStepIds(actor: Actor, steps: (typeof stepTable.$inferSelect)[]) {
  const ids = [];
  for (const step of steps) {
    if (step.status !== "pending" && step.status !== "waiting") continue;
    try {
      await assertApprovalPermission(db, { ...actor, userId: step.approverId }, "decide");
      await assertApprovalPermission(db, { ...actor, userId: step.approverId }, "read");
    } catch (error) {
      if (error instanceof OfferApprovalError) ids.push(step.id);
      else throw error;
    }
  }
  return ids;
}

async function accessFilter(actor: Actor, view: "pending" | "processed" | "submitted" | "all") {
  const person = await assertApprovalPermission(db, actor, "read");
  const mine = eq(approvalTable.applicantId, actor.userId);
  const participant = exists(
    db
      .select({ id: stepTable.id })
      .from(stepTable)
      .where(
        and(eq(stepTable.approvalId, approvalTable.id), eq(stepTable.approverId, actor.userId)),
      ),
  );
  if (view === "pending" || view === "processed") {
    return exists(
      db
        .select({ id: stepTable.id })
        .from(stepTable)
        .where(
          and(
            eq(stepTable.approvalId, approvalTable.id),
            eq(stepTable.approverId, actor.userId),
            view === "pending"
              ? eq(stepTable.status, "pending")
              : inArray(stepTable.status, ["approved", "rejected"]),
          ),
        ),
    );
  }
  if (view === "submitted") {
    return mine;
  }
  if (!hasPermissionInStatements(person.statements, "offerApproval", "manage")) {
    return or(mine, participant);
  }
  const scope = await resolveRecruitingVisibilityScope({
    currentRole: person.role,
    organizationId: actor.organizationId,
    userId: actor.userId,
  });
  const managed = exists(
    db
      .select({ id: recruitingRecord.id })
      .from(recruitingRecord)
      .where(
        and(
          eq(recruitingRecord.id, approvalTable.recruitingRecordId),
          scope.kind === "all"
            ? undefined
            : scope.kind === "restricted" && scope.userIds.length
              ? inArray(recruitingRecord.createdBy, scope.userIds)
              : sql`false`,
        ),
      ),
  );
  return or(mine, participant, managed);
}
export async function listOfferApprovals(
  actor: Actor,
  input: { view: "pending" | "processed" | "submitted" | "all"; page: number; recordId?: string },
) {
  const condition = and(
    eq(approvalTable.organizationId, actor.organizationId),
    await accessFilter(actor, input.view),
    input.recordId ? eq(approvalTable.recruitingRecordId, input.recordId) : undefined,
  );
  const [rows, counts] = await Promise.all([
    db
      .select()
      .from(approvalTable)
      .where(condition)
      .orderBy(desc(approvalTable.createdAt))
      .limit(20)
      .offset((input.page - 1) * 20),
    db.select({ total: count() }).from(approvalTable).where(condition),
  ]);
  const items = await Promise.all(
    rows.map(async (approval) => {
      const steps = await db
        .select()
        .from(stepTable)
        .where(eq(stepTable.approvalId, approval.id))
        .orderBy(stepTable.position);
      const current = steps.find((step) => step.status === "pending");
      const unavailableIds = await unavailableStepIds(actor, steps);
      return {
        applicantName: approval.applicantName,
        attemptNumber: approval.attemptNumber,
        candidateName: approval.snapshot.candidateName,
        completedAt: approval.completedAt?.toISOString() ?? null,
        completedSteps: steps.filter((step) => step.status === "approved").length,
        createdAt: approval.createdAt.toISOString(),
        currentApprover: current?.approverName ?? null,
        id: approval.id,
        invalidatedAt: approval.invalidatedAt?.toISOString() ?? null,
        position: approval.snapshot.position,
        status: approval.status,
        totalSteps: steps.length,
        unavailable: unavailableIds.length > 0,
      };
    }),
  );
  return { items, page: input.page, total: counts[0]?.total ?? 0 };
}
export async function getOfferApproval(actor: Actor, approvalId: string) {
  const [approval] = await db
    .select()
    .from(approvalTable)
    .where(
      and(
        eq(approvalTable.id, approvalId),
        eq(approvalTable.organizationId, actor.organizationId),
        await accessFilter(actor, "all"),
      ),
    );
  if (!approval) {
    throw new OfferApprovalError("审批单不存在或无权访问", 404);
  }
  const [steps, events, recordRows, person] = await Promise.all([
    db
      .select()
      .from(stepTable)
      .where(eq(stepTable.approvalId, approvalId))
      .orderBy(stepTable.position),
    db
      .select()
      .from(recruitingNotificationEvent)
      .where(approvalEventIdentity(approvalId))
      .orderBy(desc(recruitingNotificationEvent.createdAt)),
    db.select().from(recruitingRecord).where(eq(recruitingRecord.id, approval.recruitingRecordId)),
    assertApprovalPermission(db, actor, "read"),
  ]);
  const current = steps.find((step) => step.status === "pending");
  const unavailableIds = await unavailableStepIds(actor, steps);
  const notifications = await Promise.all(
    events.map(async (event) => {
      const deliveries = await db
        .select({
          error: recruitingNotificationDelivery.error,
          id: recruitingNotificationDelivery.id,
          sentAt: recruitingNotificationDelivery.sentAt,
          status: recruitingNotificationDelivery.status,
        })
        .from(recruitingNotificationDelivery)
        .where(eq(recruitingNotificationDelivery.eventId, event.id));
      return {
        createdAt: event.createdAt.toISOString(),
        deliveries: deliveries.map((delivery) => ({
          ...delivery,
          sentAt: delivery.sentAt?.toISOString() ?? null,
        })),
        error: event.lastErrorMessage,
        id: event.id,
        status: event.status,
        type: event.type,
      };
    }),
  );
  const visible = recordRows[0] ? await recordIsVisible(actor, recordRows[0], person.role) : false;
  const canManage =
    visible &&
    hasPermissionInStatements(person.statements, "offer", "update") &&
    hasPermissionInStatements(
      person.statements,
      "offerApproval",
      approval.applicantId === actor.userId ? "create" : "manage",
    );
  const history = await listOfferApprovals(actor, {
    page: 1,
    recordId: approval.recruitingRecordId,
    view: "all",
  });
  return {
    ...approval,
    canDecide:
      approval.status === "pending" &&
      !approval.invalidatedAt &&
      current?.approverId === actor.userId &&
      (actor.userId !== approval.applicantId || current?.sourceType !== "manual") &&
      hasPermissionInStatements(person.statements, "offerApproval", "decide") &&
      !!current &&
      !unavailableIds.includes(current.id),
    canManage,
    canReadCandidate:
      visible &&
      hasPermissionInStatements(person.statements, "resumeLibrary", "read") &&
      hasPermissionInStatements(person.statements, "page", "resumes"),
    completedAt: approval.completedAt?.toISOString() ?? null,
    createdAt: approval.createdAt.toISOString(),
    history: history.items,
    invalidatedAt: approval.invalidatedAt?.toISOString() ?? null,
    lastRemindedAt: approval.lastRemindedAt?.toISOString() ?? null,
    notifications,
    steps: steps.map((step) => ({
      ...step,
      activatedAt: step.activatedAt?.toISOString() ?? null,
      decidedAt: step.decidedAt?.toISOString() ?? null,
    })),
    unavailable: unavailableIds.length > 0,
    unavailableStepIds: unavailableIds,
  };
}
export async function previewOfferApproval(actor: Actor, offerId: string) {
  return db.transaction(async (tx) => {
    const { record, offer } = await lockOffer(tx, actor, offerId);
    await assertRecordManager(tx, actor, record, "create");
    const snapshot = await loadOfferSnapshot(tx, offer);
    const templates = await resolveEnabledTemplatesForPreview(tx, actor, record);
    return {
      approvalRequired: templates.length > 0,
      contentRevision: offer.contentRevision,
      currentApprovalId: offer.currentApprovalId,
      snapshot,
      snapshotHash: hashRequest(snapshot),
      templates,
    };
  });
}
