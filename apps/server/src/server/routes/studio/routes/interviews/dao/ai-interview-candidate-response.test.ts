import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import {
  account,
  globalConfig,
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
  organization,
  aiInterviewRound,
  user,
} from "@app/db-schema/schema";
import {
  addAiInterviewInvitationToSchedule,
  buildAiInterviewInvitationToken,
  hashAiInterviewInvitationToken,
} from "./ai-interview-invitation-access";
import {
  previewAiInterviewInvitation,
  recordAiInterviewInvitationException,
  respondAiInterviewInvitation,
} from "./ai-interview-candidate-response";

const ORGANIZATION_ID = "ai_initial_notification_test_org";
const USER_ID = "ai_initial_notification_test_user";
const INTERVIEW_ID = "ai_initial_notification_test_interview";
const SCHEDULE_ID = "ai_initial_notification_test_schedule";
const NOW = new Date("2026-08-24T10:00:00.000Z");
const previousEnvironment = {
  betterAuthSecret: process.env.BETTER_AUTH_SECRET,
  betterAuthUrl: process.env.BETTER_AUTH_URL,
  notificationFlow: process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED,
};

async function cleanup() {
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.id, INTERVIEW_ID));
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  process.env.BETTER_AUTH_SECRET = "ai-notification-test-secret-at-least-32-chars";
  process.env.BETTER_AUTH_URL = "https://recruitment.example.test";
  process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "ai-notification-hr@example.test",
    emailVerified: true,
    id: USER_ID,
    name: "AI Notification HR",
    updatedAt: NOW,
  });
  await db.insert(account).values({
    accountId: "ou_ai_initial_notification_test",
    createdAt: NOW,
    id: "ai_initial_notification_test_account",
    issuer: "local:oauth:feishu",
    providerId: "feishu",
    updatedAt: NOW,
    userId: USER_ID,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORGANIZATION_ID,
    name: "AI Notification Company",
    slug: ORGANIZATION_ID,
  });
  await db.insert(globalConfig).values({
    companyName: "上下文公司名称",
    id: "ai_initial_notification_test_global_config",
    organizationId: ORGANIZATION_ID,
  });
  await createRecruitingRecords(db, {
    candidateEmail: "candidate@example.test",
    candidateName: "张三",
    createdAt: NOW,
    createdBy: USER_ID,
    id: INTERVIEW_ID,
    organizationId: ORGANIZATION_ID,
    resumeParseStatus: "ready",
    targetRole: "高级前端开发工程师",
    updatedAt: NOW,
  });
  const invitation = addAiInterviewInvitationToSchedule({ id: SCHEDULE_ID }, NOW);
  await db.insert(aiInterviewRound).values({
    candidateInviteExpiresAt: invitation.candidateInviteExpiresAt,
    candidateInviteStatus: "sent",
    candidateInviteTokenHash: invitation.candidateInviteTokenHash,
    createdAt: NOW,
    createdBy: USER_ID,
    id: SCHEDULE_ID,
    invitationVersion: 1,
    organizationId: ORGANIZATION_ID,
    recruitingRecordId: INTERVIEW_ID,
    roundLabel: "AI HR 初面",
    sortOrder: 0,
    status: "pending",
    updatedAt: NOW,
  });
});

afterAll(async () => {
  await cleanup();
  if (previousEnvironment.betterAuthSecret === undefined) {
    delete process.env.BETTER_AUTH_SECRET;
  } else {
    process.env.BETTER_AUTH_SECRET = previousEnvironment.betterAuthSecret;
  }
  if (previousEnvironment.betterAuthUrl === undefined) {
    delete process.env.BETTER_AUTH_URL;
  } else {
    process.env.BETTER_AUTH_URL = previousEnvironment.betterAuthUrl;
  }
  if (previousEnvironment.notificationFlow === undefined) {
    delete process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED;
  } else {
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = previousEnvironment.notificationFlow;
  }
});

beforeEach(async () => {
  await db
    .delete(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.recruitingRecordId, INTERVIEW_ID));
  await db
    .delete(recruitingNotificationEvent)
    .where(eq(recruitingNotificationEvent.recruitingRecordId, INTERVIEW_ID));
  const invitation = addAiInterviewInvitationToSchedule({ id: SCHEDULE_ID }, NOW);
  await db
    .update(aiInterviewRound)
    .set({
      candidateDeclineReason: null,
      candidateInviteExpiresAt: invitation.candidateInviteExpiresAt,
      candidateInviteStatus: "sent",
      candidateInviteTokenHash: invitation.candidateInviteTokenHash,
      candidateRespondedAt: null,
      invitationVersion: 1,
      status: "pending",
      updatedAt: NOW,
    })
    .where(eq(aiInterviewRound.id, SCHEDULE_ID));
});

describe("AI interview candidate response notification", () => {
  it("does not return an interview URL when the candidate declines", async () => {
    const invitation = addAiInterviewInvitationToSchedule({ id: SCHEDULE_ID }, NOW);
    const token = buildAiInterviewInvitationToken({
      exp: invitation.candidateInviteExpiresAt.getTime(),
      scheduleEntryId: SCHEDULE_ID,
    });

    await expect(respondAiInterviewInvitation({ action: "decline", token })).resolves.toEqual({
      interviewUrl: null,
      status: "declined",
    });
  });

  it("creates a first-round HR feedback event and a Feishu-card delivery for the initiator", async () => {
    const invitation = addAiInterviewInvitationToSchedule({ id: SCHEDULE_ID }, NOW);
    const token = buildAiInterviewInvitationToken({
      exp: invitation.candidateInviteExpiresAt.getTime(),
      scheduleEntryId: SCHEDULE_ID,
    });

    await expect(respondAiInterviewInvitation({ action: "accept", token })).resolves.toMatchObject({
      status: "accepted",
    });

    const [event] = await db
      .select()
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.aiRoundId, SCHEDULE_ID),
          eq(recruitingNotificationEvent.type, "ai_invitation_accepted"),
        ),
      );
    expect(event?.payloadSnapshot).toMatchObject({
      candidateName: "张三",
      companyName: "上下文公司名称",
      jobName: "高级前端开发工程师",
      roundName: "AI HR 初面",
    });
    expect(event?.payloadSnapshot.responseTime).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    if (!event) {
      throw new Error("AI 候选人接受通知事件不存在");
    }

    const [delivery] = await db
      .select()
      .from(recruitingNotificationDelivery)
      .where(eq(recruitingNotificationDelivery.eventId, event.id));
    // Do not assert the mutable delivery status: a concurrently running local
    // Worker may claim this real-DB fixture after its immutable routing fields are written.
    expect(delivery).toMatchObject({
      audienceType: "initiator_fallback",
      channel: "feishu",
      providerId: "feishu",
      recipientAddress: "ou_ai_initial_notification_test",
      recipientUserId: USER_ID,
      templateVersionId: "system_ai_accepted_initiator_feishu_v3",
    });
    expect(delivery?.renderedContent).toContain("接受 第一轮 HR 面试");
    expect(delivery?.renderedContent).toContain("反馈时间：");
  });

  it("records an expired invitation as an HR exception delivery", async () => {
    const expiresAt = new Date(Date.now() - 60_000);
    const token = buildAiInterviewInvitationToken({
      exp: expiresAt.getTime(),
      scheduleEntryId: SCHEDULE_ID,
    });
    await db
      .update(aiInterviewRound)
      .set({
        candidateInviteExpiresAt: expiresAt,
        candidateInviteTokenHash: hashAiInterviewInvitationToken(token),
      })
      .where(eq(aiInterviewRound.id, SCHEDULE_ID));

    await expect(respondAiInterviewInvitation({ action: "accept", token })).rejects.toMatchObject({
      code: "invitation_expired",
      status: 410,
    });
    await expect(previewAiInterviewInvitation(token)).resolves.toMatchObject({ status: "expired" });

    const [event] = await db
      .select()
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.aiRoundId, SCHEDULE_ID),
          eq(recruitingNotificationEvent.type, "ai_invitation_exception"),
        ),
      );
    expect(event?.payloadSnapshot).toMatchObject({
      candidateName: "张三",
      exceptionType: "邀请已过期",
    });
    if (!event) {
      throw new Error("AI 邀请过期通知事件不存在");
    }
    const deliveries = await db
      .select()
      .from(recruitingNotificationDelivery)
      .where(eq(recruitingNotificationDelivery.eventId, event.id));
    const hrDelivery = deliveries.find(
      (delivery) => delivery.audienceType === "initiator_fallback",
    );
    expect(hrDelivery).toMatchObject({
      channel: "feishu",
      recipientUserId: USER_ID,
      templateVersionId: "system_ai_invitation_exception_initiator_feishu_v1",
    });
    expect(hrDelivery?.renderedContent).toContain("异常类型：邀请已过期");
    expect(deliveries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          audienceType: "candidate",
          channel: "email",
          templateVersionId: "system_ai_invitation_exception_candidate_email_v1",
        }),
      ]),
    );
  });

  it("records an opposite response as a state-conflict HR exception", async () => {
    const invitation = addAiInterviewInvitationToSchedule({ id: SCHEDULE_ID }, NOW);
    const token = buildAiInterviewInvitationToken({
      exp: invitation.candidateInviteExpiresAt.getTime(),
      scheduleEntryId: SCHEDULE_ID,
    });
    await db
      .update(aiInterviewRound)
      .set({ candidateInviteStatus: "declined" })
      .where(eq(aiInterviewRound.id, SCHEDULE_ID));

    await expect(respondAiInterviewInvitation({ action: "accept", token })).rejects.toMatchObject({
      code: "response_conflict",
      status: 409,
    });
    await recordAiInterviewInvitationException({ exceptionType: "response_conflict", token });

    const [event] = await db
      .select()
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.aiRoundId, SCHEDULE_ID),
          eq(recruitingNotificationEvent.type, "ai_invitation_exception"),
        ),
      );
    expect(event?.payloadSnapshot).toMatchObject({
      exceptionType: "确认状态冲突",
      suggestedAction: "请人工联系候选人确认最终面试意向，必要时重新发起邀请。",
    });
  });

  it("records a server-side acceptance failure without changing the candidate status", async () => {
    const invitation = addAiInterviewInvitationToSchedule({ id: SCHEDULE_ID }, NOW);
    const token = buildAiInterviewInvitationToken({
      exp: invitation.candidateInviteExpiresAt.getTime(),
      scheduleEntryId: SCHEDULE_ID,
    });

    await recordAiInterviewInvitationException({ exceptionType: "system_error", token });

    const [schedule] = await db
      .select({ status: aiInterviewRound.candidateInviteStatus })
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.id, SCHEDULE_ID));
    const [event] = await db
      .select()
      .from(recruitingNotificationEvent)
      .where(
        and(
          eq(recruitingNotificationEvent.aiRoundId, SCHEDULE_ID),
          eq(recruitingNotificationEvent.type, "ai_invitation_exception"),
        ),
      );
    expect(schedule?.status).toBe("sent");
    expect(event?.payloadSnapshot).toMatchObject({
      exceptionType: "系统处理失败",
    });
  });
});
