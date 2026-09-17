import { and, desc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { account, member, recruitingNotificationDelivery } from "@app/db-schema/schema";
import { db } from "../../../../../lib/server/db/index";
import { FEISHU_PROVIDER_IDS } from "../../../../integrations/feishu/provider";
import { reportConversationId } from "./report-conversation";

// Manual delivery owns a separate legacy-compatible row; never reset a Worker
// event's status, lease, request identity or retry schedule while debugging it.
export function claimPlatformReportResend(notificationId: string, recipientUserId?: string) {
  return db.transaction(async (tx) => {
    const [source] = await tx
      .select({
        ...getTableColumns(recruitingNotificationDelivery),
        conversationId: reportConversationId,
      })
      .from(recruitingNotificationDelivery)
      .where(eq(recruitingNotificationDelivery.id, notificationId))
      .limit(1);
    if (!source) {
      throw new Error("通知记录不存在");
    }
    if (!["summary_ready", "ai_report_ready"].includes(source.type)) {
      throw new Error("暂不支持重发该类型通知");
    }
    if (!source.conversationId) {
      throw new Error("通知缺少面试会话，无法重发");
    }
    if (!FEISHU_PROVIDER_IDS.some((id) => id === source.providerId)) {
      throw new Error("只支持重发飞书机器人通知");
    }
    if (
      source.status === "sending" ||
      (source.eventId && ["pending", "failed"].includes(source.status))
    ) {
      throw new Error("通知正在投递或等待自动重试，请等待结果后再重发");
    }
    const targetUserId = recipientUserId ?? source.recipientUserId;
    if (!targetUserId) {
      throw new Error("请选择当前工作区内已绑定飞书的接收人");
    }
    const [recipient] = await tx
      .select({ openId: account.accountId })
      .from(member)
      .innerJoin(
        account,
        and(eq(account.userId, member.userId), eq(account.providerId, source.providerId)),
      )
      .where(and(eq(member.organizationId, source.organizationId), eq(member.userId, targetUserId)))
      .orderBy(desc(account.updatedAt))
      .limit(1);
    if (!recipient) {
      throw new Error("所选用户不是当前工作区内已绑定对应飞书机器人的成员");
    }
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`report-resend:${source.recruitingRecordId}:${source.conversationId}:${source.providerId}:${targetUserId}`}, 0))`,
    );
    const [existing] = await tx
      .select()
      .from(recruitingNotificationDelivery)
      .where(
        and(
          eq(recruitingNotificationDelivery.recruitingRecordId, source.recruitingRecordId),
          eq(recruitingNotificationDelivery.conversationId, source.conversationId),
          eq(recruitingNotificationDelivery.providerId, source.providerId),
          eq(recruitingNotificationDelivery.recipientUserId, targetUserId),
          inArray(recruitingNotificationDelivery.type, ["summary_ready", "ai_report_ready"]),
          isNull(recruitingNotificationDelivery.eventId),
        ),
      )
      .limit(1);
    if (existing && ["sending", "pending"].includes(existing.status)) {
      throw new Error("通知正在重新发送，请等待结果");
    }
    const id = existing?.id ?? crypto.randomUUID();
    const values = {
      attemptCount: (existing?.attemptCount ?? 0) + 1,
      error: null,
      feishuMessageId: null,
      providerMessageId: null,
      recipientAddress: recipient.openId,
      recipientOpenId: recipient.openId,
      recipientUserId: targetUserId,
      sentAt: null,
      status: "sending" as const,
    };
    if (existing) {
      const [claimed] = await tx
        .update(recruitingNotificationDelivery)
        .set(values)
        .where(
          and(
            eq(recruitingNotificationDelivery.id, id),
            eq(recruitingNotificationDelivery.status, existing.status),
          ),
        )
        .returning({ id: recruitingNotificationDelivery.id });
      if (!claimed) {
        throw new Error("通知状态已变化，请刷新后重试");
      }
    } else {
      await tx.insert(recruitingNotificationDelivery).values({
        ...values,
        conversationId: source.conversationId,
        id,
        organizationId: source.organizationId,
        providerId: source.providerId,
        recruitingRecordId: source.recruitingRecordId,
        type: "ai_report_ready",
      });
    }
    return {
      conversationId: source.conversationId,
      interviewRecordId: source.recruitingRecordId,
      notificationId: id,
      providerId: source.providerId,
      recipientOpenId: recipient.openId,
    };
  });
}

export async function finishPlatformReportResend(
  id: string,
  result: { messageId: string | null; sentAt: Date } | { error: string },
) {
  await db
    .update(recruitingNotificationDelivery)
    .set(
      "error" in result
        ? { error: result.error, resultUnknownAt: new Date(), status: "unknown" }
        : {
            error: null,
            feishuMessageId: result.messageId,
            providerMessageId: result.messageId,
            resultUnknownAt: null,
            sentAt: result.sentAt,
            status: "sent",
          },
    )
    .where(
      and(
        eq(recruitingNotificationDelivery.id, id),
        isNull(recruitingNotificationDelivery.eventId),
        eq(recruitingNotificationDelivery.status, "sending"),
      ),
    );
}
