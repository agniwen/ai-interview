/* oxlint-disable complexity, curly, no-nested-ternary, typescript/no-non-null-assertion -- Notification preparation validates several independent current-state invariants in one transaction. */
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  account,
  organization,
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
  recruitingOfferApproval,
  recruitingOfferApprovalStep,
  recruitingRecord,
} from "@app/db-schema/schema";
import type { Database } from "@app/database";
import type { RecruitingExecutor } from "@app/database/recruiting-records";
import { createInterviewNotificationDelivery } from "../../../../../interview-notifications/dao";
import { absolutePublicAppUrl } from "../../../../../../lib/server/public-app-url";
import {
  FEISHU_PROVIDER_IDS,
  selectPreferredFeishuProviderId,
  getFeishuAppCredentials,
} from "../../../../../integrations/feishu/provider";
import { assertApprovalPermission, OfferApprovalError } from "../dao";

type Event = typeof recruitingNotificationEvent.$inferSelect;
type Delivery = typeof recruitingNotificationDelivery.$inferSelect;

export async function offerApprovalNotificationApplicable(
  executor: RecruitingExecutor,
  event: Event,
) {
  const payload = event.payloadSnapshot.offerApproval;
  if (event.scopeType !== "offer_approval" || !payload) {
    return false;
  }
  const [fresh] = await executor
    .select()
    .from(recruitingNotificationEvent)
    .where(eq(recruitingNotificationEvent.id, event.id));
  if (!fresh || fresh.status === "cancelled") {
    return false;
  }
  const [approval] = await executor
    .select()
    .from(recruitingOfferApproval)
    .where(
      and(
        eq(recruitingOfferApproval.id, payload.approvalId),
        eq(recruitingOfferApproval.organizationId, event.organizationId),
        eq(recruitingOfferApproval.recruitingRecordId, event.recruitingRecordId ?? ""),
      ),
    );
  if (!approval) {
    return false;
  }
  await assertApprovalPermission(
    executor,
    { organizationId: event.organizationId, userId: payload.recipientUserId },
    "read",
  );
  if (event.type === "offer_approval_pending") {
    await assertApprovalPermission(
      executor,
      { organizationId: event.organizationId, userId: payload.recipientUserId },
      "decide",
    );
    const [step] = await executor
      .select()
      .from(recruitingOfferApprovalStep)
      .where(
        and(
          eq(recruitingOfferApprovalStep.id, payload.stepId ?? ""),
          eq(recruitingOfferApprovalStep.approvalId, approval.id),
        ),
      );
    const [record] = await executor
      .select()
      .from(recruitingRecord)
      .where(eq(recruitingRecord.id, approval.recruitingRecordId));
    return (
      approval.status === "pending" &&
      !approval.invalidatedAt &&
      record?.currentStage === "offer" &&
      step?.status === "pending" &&
      step.position === approval.currentStep &&
      step.approverId === payload.recipientUserId
    );
  }
  if (event.type === "offer_approval_result") {
    return (
      !approval.invalidatedAt &&
      ["approved", "rejected"].includes(approval.status) &&
      approval.status === payload.status &&
      approval.applicantId === payload.recipientUserId
    );
  }
  if (
    event.type !== "offer_approval_cancelled" ||
    !(approval.invalidatedAt || ["cancelled", "withdrawn"].includes(approval.status))
  ) {
    return false;
  }
  const [step] = await executor
    .select()
    .from(recruitingOfferApprovalStep)
    .where(
      and(
        eq(recruitingOfferApprovalStep.approvalId, approval.id),
        eq(recruitingOfferApprovalStep.id, payload.stepId ?? ""),
        eq(recruitingOfferApprovalStep.approverId, payload.recipientUserId),
      ),
    );
  return !!step?.activatedAt;
}

export async function prepareOfferApprovalNotification(database: Database, event: Event) {
  if (event.scopeType !== "offer_approval") {
    return;
  }
  const payload = event.payloadSnapshot.offerApproval;
  if (!payload || !event.recruitingRecordId) {
    throw new Error("审批通知缺少归属信息");
  }
  // Lock the event so concurrent preparations cannot resolve different bindings for the same identity.
  await database.transaction(async (tx) => {
    await tx
      .select({ id: recruitingNotificationEvent.id })
      .from(recruitingNotificationEvent)
      .where(eq(recruitingNotificationEvent.id, event.id))
      .for("update");
    const existing = await tx
      .select({ id: recruitingNotificationDelivery.id })
      .from(recruitingNotificationDelivery)
      .where(eq(recruitingNotificationDelivery.eventId, event.id));
    if (existing.length) {
      return;
    }
    let notificationError: string | null = null;
    try {
      if (!(await offerApprovalNotificationApplicable(tx, event))) {
        notificationError = "审批通知已不适用当前状态";
      }
    } catch (error) {
      if (error instanceof OfferApprovalError) {
        notificationError = error.message;
      } else {
        throw error;
      }
    }
    const bindings = await tx
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, payload.recipientUserId),
          inArray(account.providerId, [...FEISHU_PROVIDER_IDS]),
        ),
      )
      .orderBy(desc(account.updatedAt));
    const providerId = selectPreferredFeishuProviderId(
      bindings.map((binding) => binding.providerId),
    );
    const binding = bindings.find((item) => item.providerId === providerId);
    if (!binding || !providerId) {
      notificationError ??= "审批人未绑定飞书账号，系统待办仍可处理";
    } else {
      try {
        getFeishuAppCredentials(providerId);
      } catch {
        notificationError ??= "飞书应用尚未配置，系统待办仍可处理";
      }
    }
    const [workspace] = await tx
      .select()
      .from(organization)
      .where(eq(organization.id, event.organizationId));
    const url = workspace
      ? absolutePublicAppUrl(
          `/w/${encodeURIComponent(workspace.slug)}/studio/offer-approvals/${encodeURIComponent(payload.approvalId)}`,
        )
      : undefined;
    if (!url) {
      notificationError ??= "系统访问地址尚未配置";
    }
    const status =
      event.type === "offer_approval_pending"
        ? "待你审批"
        : event.type === "offer_approval_cancelled"
          ? "任务已结束"
          : payload.status === "approved"
            ? "审批通过，待 HR 发布"
            : "审批已驳回";
    const content = `工作区：${workspace?.name ?? ""}\n审批编号：${payload.approvalId}\n候选人：${event.payloadSnapshot.candidateName ?? ""}\n岗位：${event.payloadSnapshot.jobName ?? ""}\n发起人：${event.payloadSnapshot.initiatorName ?? ""}\n${status}\n当前状态以系统页面为准。\n${url ? `[进入系统审批](${url})` : ""}`;
    await createInterviewNotificationDelivery(tx, {
      audienceType: "offer_approval_user",
      channel: "feishu",
      error: notificationError,
      eventId: event.id,
      interviewRecordId: event.recruitingRecordId!,
      lastErrorCode: notificationError ? "offer-approval-notification-unavailable" : null,
      organizationId: event.organizationId,
      providerId: providerId ?? "feishu-jiguang-hr",
      providerRequestKey: `offer-approval:${event.id}:${payload.recipientUserId}`,
      recipientAddress: binding?.accountId ?? `missing-feishu:${payload.recipientUserId}`,
      recipientUserId: payload.recipientUserId,
      renderedContent: content,
      renderedSubject: `Offer ${status}`,
      status: notificationError ? "dead" : "pending",
      templateVersionId: null,
      type: event.type,
    });
  });
}

export async function validateOfferApprovalDelivery(
  database: Database,
  event: Event,
  delivery: Delivery,
) {
  if (event.scopeType !== "offer_approval") {
    return true;
  }
  const payload = event.payloadSnapshot.offerApproval;
  if (
    !payload ||
    delivery.recipientUserId !== payload.recipientUserId ||
    delivery.audienceType !== "offer_approval_user" ||
    delivery.channel !== "feishu"
  ) {
    return false;
  }
  try {
    if (!(await offerApprovalNotificationApplicable(database, event))) {
      return false;
    }
  } catch (error) {
    if (error instanceof OfferApprovalError) {
      return false;
    }
    throw error;
  }
  // A binding removed or replaced after preparation cannot receive an old pending delivery.
  const [binding] = await database
    .select({ id: account.id })
    .from(account)
    .where(
      and(
        eq(account.userId, payload.recipientUserId),
        eq(account.providerId, delivery.providerId),
        eq(account.accountId, delivery.recipientAddress ?? ""),
      ),
    );
  return !!binding;
}
