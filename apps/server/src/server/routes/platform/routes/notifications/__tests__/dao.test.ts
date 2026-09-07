import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createRecruitingRecords } from "@app/database/recruiting-records";
import {
  account,
  member,
  user,
  aiInterviewConversation,
  organization,
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
  recruitingEvaluationDocument,
} from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import { queryPaginatedPlatformNotifications } from "../dao";
import { resendPlatformReportNotification } from "../application/resend-report-notification";

const org = `platform-notifications-${crypto.randomUUID()}`;
beforeAll(async () => {
  await db.insert(organization).values({ createdAt: new Date(), id: org, name: org, slug: org });
  await createRecruitingRecords(db, {
    candidateName: org,
    id: org,
    interviewQuestions: [],
    organizationId: org,
  });
  await db
    .insert(user)
    .values({ email: `${org}@example.test`, emailVerified: false, id: org, name: org });
  await db
    .insert(member)
    .values({ createdAt: new Date(), id: org, organizationId: org, role: "member", userId: org });
  await db.insert(account).values({
    accountId: "current-open",
    createdAt: new Date(),
    id: org,
    issuer: "feishu",
    providerId: "feishu",
    updatedAt: new Date(),
    userId: org,
  });
  await db.insert(aiInterviewConversation).values({
    conversationId: org,
    lastSyncedAt: new Date(),
    organizationId: org,
    recruitingRecordId: org,
    status: "completed",
    summaryStatus: "ready",
  });
  await db.insert(recruitingNotificationEvent).values({
    conversationId: org,
    dedupeKey: org,
    id: org,
    organizationId: org,
    payloadSnapshot: { schemaVersion: 1, timeZone: "Asia/Shanghai" },
    recruitingRecordId: org,
    scopeType: "interview_record",
    type: "ai_report_ready",
  });
  await db.insert(recruitingEvaluationDocument).values({
    documentId: "shared-doc",
    documentUrl: "https://feishu.cn/docx/shared-doc",
    organizationId: org,
    providerId: "feishu-jiguang-hr",
    recruitingRecordId: org,
    status: "ready",
  });
  await db.insert(recruitingNotificationDelivery).values({
    conversationId: null,
    eventId: org,
    id: org,
    organizationId: org,
    providerId: "feishu",
    providerMessageId: "worker-message",
    recipientOpenId: "open",
    recipientUserId: org,
    recruitingRecordId: org,
    status: "unknown",
    type: "ai_report_ready",
  });
});
afterAll(async () => {
  await db.delete(organization).where(eq(organization.id, org));
  await db.delete(user).where(eq(user.id, org));
});

it("lists Worker report deliveries with their real status and provider message identity", async () => {
  const result = await queryPaginatedPlatformNotifications({ page: 1, pageSize: 20, search: org });
  expect(result.records).toEqual([
    expect.objectContaining({
      conversationId: org,
      feishuDocumentUrl: "https://feishu.cn/docx/shared-doc",
      feishuMessageId: "worker-message",
      id: org,
      status: "unknown",
    }),
  ]);
});

it("resends via the shared sender without changing the Worker row, and serializes duplicate clicks", async () => {
  const [original] = await db
    .select()
    .from(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.id, org));
  const send = vi.fn(async (input) => {
    expect(input.recipientOpenId).toBe("current-open");
    expect(input.notificationId).not.toBe(org);
    await expect(resendPlatformReportNotification(org, undefined, send)).rejects.toThrow(
      "正在重新发送",
    );
    return { providerMessageId: "manual-message" };
  });
  const result = await resendPlatformReportNotification(org, undefined, send);
  expect(send).toHaveBeenCalledTimes(1);
  const [after] = await db
    .select()
    .from(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.id, org));
  expect(after).toEqual(original);
  const [manual] = await db
    .select()
    .from(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.id, result.notificationId));
  expect(manual).toMatchObject({
    eventId: null,
    providerMessageId: "manual-message",
    recipientAddress: "current-open",
    status: "sent",
    type: "ai_report_ready",
  });
  await expect(resendPlatformReportNotification(org, "outsider", send)).rejects.toThrow(
    "当前工作区",
  );
  expect(send).toHaveBeenCalledTimes(1);
  await expect(
    resendPlatformReportNotification(org, undefined, () =>
      Promise.reject(new Error("transport disconnected")),
    ),
  ).rejects.toThrow("transport disconnected");
  const [unknown] = await db
    .select()
    .from(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.id, result.notificationId));
  expect(unknown).toMatchObject({
    error: "transport disconnected",
    providerMessageId: null,
    sentAt: null,
    status: "unknown",
  });
});

it("refuses to reset an active Worker delivery", async () => {
  await db
    .update(recruitingNotificationDelivery)
    .set({ status: "sending" })
    .where(eq(recruitingNotificationDelivery.id, org));
  const send = vi.fn();
  await expect(resendPlatformReportNotification(org, undefined, send)).rejects.toThrow("等待结果");
  expect(send).not.toHaveBeenCalled();
});

it.each(["summary_ready", "ai_report_ready"] as const)(
  "keeps manual resend available for historical %s rows",
  async (type) => {
    const id = `${org}-${type}`;
    await db.insert(aiInterviewConversation).values({
      conversationId: id,
      lastSyncedAt: new Date(),
      organizationId: org,
      recruitingRecordId: org,
      status: "completed",
    });
    await db.insert(recruitingNotificationDelivery).values({
      conversationId: id,
      id,
      organizationId: org,
      providerId: "feishu",
      recipientOpenId: "old-open",
      recipientUserId: org,
      recruitingRecordId: org,
      status: "sent",
      type,
    });
    const send = vi.fn(() => Promise.resolve({ providerMessageId: "resent-historical" }));
    await expect(resendPlatformReportNotification(id, undefined, send)).resolves.toMatchObject({
      notificationId: id,
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: id, recipientOpenId: "current-open" }),
    );
  },
);
