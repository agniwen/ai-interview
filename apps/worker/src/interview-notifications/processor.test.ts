/* oxlint-disable require-await, no-useless-undefined -- Vitest mocks preserve Promise-shaped dependency contracts. */
import { describe, expect, it, vi } from "vitest";
import type { InterviewNotificationDeliveryRecord, InterviewNotificationEventRecord } from "./dao";
import { InterviewNotificationProviderError } from "@app/shared/interview-notifications";
import type { InterviewNotificationProcessorDependencies } from "./processor";
import { processInterviewNotificationEvent } from "./processor";

const now = new Date("2026-08-20T02:00:00.000Z");

function event(
  overrides: Partial<InterviewNotificationEventRecord> = {},
): InterviewNotificationEventRecord {
  return {
    actorUserId: "user_1",
    aiRoundId: null,
    attemptCount: 1,
    availableAt: now,
    completedAt: null,
    conversationId: "conversation_1",
    createdAt: now,
    dedupeKey: "ai_report_ready:conversation_1:1",
    humanMeetingId: null,
    humanRoundId: null,
    id: "event_1",
    lastErrorCode: null,
    lastErrorMessage: null,
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    leaseOwner: "worker_1",
    nextAttemptAt: now,
    organizationId: "org_1",
    payloadSnapshot: { schemaVersion: 1, timeZone: "Asia/Shanghai" },
    recruitingRecordId: "record_1",
    scopeType: "interview_record",
    status: "processing",
    type: "ai_report_ready",
    updatedAt: now,
    ...overrides,
  };
}

function delivery(overrides: Partial<InterviewNotificationDeliveryRecord> = {}) {
  return {
    attemptCount: 0,
    audienceType: "initiator_fallback",
    channel: "email",
    conversationId: null,
    createdAt: now,
    error: null,
    eventId: "event_1",
    feishuDocumentId: null,
    feishuDocumentUrl: null,
    feishuMessageId: null,
    id: "delivery_1",
    lastErrorCode: null,
    leaseExpiresAt: null,
    leaseOwner: null,
    nextAttemptAt: now,
    organizationId: "org_1",
    providerId: "email",
    providerMessageId: null,
    providerRequestKey: "event_1:email:hr@example.com",
    recipientAddress: "hr@example.com",
    recipientDisplayName: "HR",
    recipientOpenId: "hr@example.com",
    recipientUserId: "user_1",
    recruitingRecordId: "record_1",
    renderedContent: "报告已生成",
    renderedSubject: "报告通知",
    resultUnknownAt: null,
    sentAt: null,
    status: "pending",
    templateVersionId: "template_v1",
    type: "ai_report_ready",
    updatedAt: now,
    ...overrides,
  } satisfies InterviewNotificationDeliveryRecord;
}

function dependencies(overrides: Partial<InterviewNotificationDeliveryRecord> = {}) {
  let rows = [delivery(overrides)];
  const mocks = {
    claimDelivery: vi.fn(async () => {
      rows = [{ ...rows[0], attemptCount: 1, status: "sending" }];
      return rows[0];
    }),
    listDeliveries: vi.fn(async () => rows),
    markDeliveryFailed: vi.fn(async (input) => {
      rows = [
        {
          ...rows[0],
          error: input.message,
          lastErrorCode: input.code,
          nextAttemptAt: input.nextAttemptAt,
          status: input.status,
        },
      ];
      return true;
    }),
    markDeliverySent: vi.fn(async (input) => {
      rows = [
        {
          ...rows[0],
          providerMessageId: input.providerMessageId,
          status: "sent",
        },
      ];
      return true;
    }),
    send: vi.fn(async () => ({ providerMessageId: "provider_1" })),
    updateEventState: vi.fn(async () => true),
  } satisfies InterviewNotificationProcessorDependencies;
  return mocks;
}

describe("interview notification processor", () => {
  it.each([
    "human_candidate_invitation_requested",
    "human_interview_confirmed",
    "human_interview_rescheduled",
    "human_interview_cancelled",
    "human_interview_reminder",
  ] as const)("sends only explicitly confirmed manual human email: %s", async (type) => {
    const manualHumanEmail = {
      confirmedAt: now.toISOString(),
      confirmedBy: "user_1",
      eventType: type,
      meetingId: "meeting_1",
      organizationId: "org_1",
      recipient: "candidate@example.com",
      requestId: "4b21611a-c4e9-4c7a-8c0a-4fdd65dd0bf6",
      roundId: "round_1",
      subject: "面试通知",
      text: "通知正文",
      version: 1 as const,
    };
    const input = event({
      humanMeetingId: "meeting_1",
      humanRoundId: "round_1",
      payloadSnapshot: { manualHumanEmail, schemaVersion: 1, timeZone: "Asia/Shanghai" },
      type,
    });
    const row = {
      audienceType: "candidate" as const,
      recipientAddress: manualHumanEmail.recipient,
      renderedContent: manualHumanEmail.text,
      renderedSubject: manualHumanEmail.subject,
      type,
    };
    const mocks = dependencies(row);
    await processInterviewNotificationEvent(input, { leaseOwner: "worker_1", now }, mocks);
    expect(mocks.send).toHaveBeenCalledOnce();
    const blocked = dependencies(row);
    await processInterviewNotificationEvent(
      { ...input, payloadSnapshot: { schemaVersion: 1, timeZone: "Asia/Shanghai" } },
      { leaseOwner: "worker_1", now },
      blocked,
    );
    expect(blocked.send).not.toHaveBeenCalled();
  });
  it("sends only the newly confirmed manual AI invitation to the approved recipient", async () => {
    const manualAiInvitation = {
      confirmedAt: now.toISOString(),
      confirmedBy: "user_1",
      html: "<p>邀请正文</p>",
      organizationId: "org_1",
      recipient: "candidate@example.com",
      requestId: "4b21611a-c4e9-4c7a-8c0a-4fdd65dd0bf6",
      roundId: "round_1",
      subject: "面试邀请",
      text: "邀请正文",
      version: 1 as const,
    };
    const input = event({
      actorUserId: "user_1",
      aiRoundId: "round_1",
      payloadSnapshot: { manualAiInvitation, schemaVersion: 1, timeZone: "Asia/Shanghai" },
      type: "ai_interview_invited",
    });
    const mocks = dependencies({
      audienceType: "candidate",
      recipientAddress: manualAiInvitation.recipient,
      renderedContent: manualAiInvitation.text,
      renderedSubject: manualAiInvitation.subject,
    });
    await processInterviewNotificationEvent(input, { leaseOwner: "worker_1", now }, mocks);
    expect(mocks.send).toHaveBeenCalledOnce();
    const mismatch = dependencies({
      audienceType: "candidate",
      recipientAddress: "other@example.com",
      renderedContent: manualAiInvitation.text,
      renderedSubject: manualAiInvitation.subject,
    });
    await processInterviewNotificationEvent(input, { leaseOwner: "worker_1", now }, mismatch);
    expect(mismatch.send).not.toHaveBeenCalled();
    const reminder = dependencies({
      audienceType: "candidate",
      recipientAddress: manualAiInvitation.recipient,
      renderedContent: manualAiInvitation.text,
      renderedSubject: manualAiInvitation.subject,
    });
    await processInterviewNotificationEvent(
      { ...input, type: "ai_interview_reminder" },
      { leaseOwner: "worker_1", now },
      reminder,
    );
    expect(reminder.send).not.toHaveBeenCalled();
  });
  it("stops finalizing when the paused delivery lease was lost", async () => {
    const mocks = dependencies({ audienceType: "candidate" });
    mocks.markDeliveryFailed.mockResolvedValueOnce(false);
    await processInterviewNotificationEvent(event(), { leaseOwner: "worker_1", now }, mocks);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.updateEventState).not.toHaveBeenCalled();
  });
  it("blocks old queued candidate emails without HR confirmation", async () => {
    const mocks = dependencies({ audienceType: "candidate" });
    await processInterviewNotificationEvent(event(), { leaseOwner: "worker_1", now }, mocks);
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.markDeliveryFailed).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "candidate-email-paused",
        nextAttemptAt: null,
        status: "dead",
      }),
    );
  });

  it("blocks even previously authorized invitations and reminders during the pause", async () => {
    const notificationEvent = event();
    notificationEvent.type = "ai_interview_invited";
    Object.assign(notificationEvent.payloadSnapshot, { candidateEmailConfirmedBy: "user_1" });
    const mocks = dependencies({ audienceType: "candidate" });
    await processInterviewNotificationEvent(
      notificationEvent,
      { leaseOwner: "worker_1", now },
      mocks,
    );
    expect(mocks.send).not.toHaveBeenCalled();
    const reminderMocks = dependencies({ audienceType: "candidate" });
    notificationEvent.type = "ai_interview_reminder";
    await processInterviewNotificationEvent(
      notificationEvent,
      { leaseOwner: "worker_1", now },
      reminderMocks,
    );
    expect(reminderMocks.send).not.toHaveBeenCalled();
  });
  it("claims newly prepared deliveries with a fresh timestamp", async () => {
    const mocks = dependencies();
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(now.getTime() + 1000);
    try {
      await processInterviewNotificationEvent(event(), { leaseOwner: "worker_1", now }, mocks);
    } finally {
      dateNow.mockRestore();
    }
    expect(mocks.claimDelivery).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      leaseDurationMs: 60_000,
      leaseOwner: "worker_1",
      now: new Date("2026-08-20T02:00:01.000Z"),
    });
  });

  it("marks the event complete after all deliveries are sent", async () => {
    const mocks = dependencies();
    const notificationEvent = event();
    await processInterviewNotificationEvent(
      notificationEvent,
      { leaseOwner: "worker_1", now },
      mocks,
    );
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        audienceType: "initiator_fallback",
        conversationId: "conversation_1",
        deliveryId: "delivery_1",
        interviewRecordId: "record_1",
        payload: notificationEvent.payloadSnapshot,
        type: "ai_report_ready",
      }),
    );
    expect(mocks.markDeliverySent).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      leaseOwner: "worker_1",
      providerMessageId: "provider_1",
      sentAt: now,
    });
    expect(mocks.updateEventState).toHaveBeenLastCalledWith({
      completedAt: now,
      eventId: "event_1",
      leaseOwner: "worker_1",
      status: "completed",
    });
  });

  it("schedules the first transient failure one minute later", async () => {
    const mocks = dependencies();
    mocks.send.mockRejectedValueOnce(
      new InterviewNotificationProviderError({
        code: "provider-rate-limited",
        kind: "retryable",
        message: "请求过于频繁",
      }),
    );
    await processInterviewNotificationEvent(event(), { leaseOwner: "worker_1", now }, mocks);
    expect(mocks.markDeliveryFailed).toHaveBeenCalledWith({
      code: "provider-rate-limited",
      deliveryId: "delivery_1",
      leaseOwner: "worker_1",
      message: "请求过于频繁",
      nextAttemptAt: new Date("2026-08-20T02:01:00.000Z"),
      status: "failed",
    });
    expect(mocks.updateEventState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        eventId: "event_1",
        nextAttemptAt: new Date("2026-08-20T02:01:00.000Z"),
        status: "failed",
      }),
    );
  });

  it("does not blindly retry an ambiguous provider result", async () => {
    const mocks = dependencies();
    mocks.send.mockRejectedValueOnce(new Error("connection closed after request body"));
    await processInterviewNotificationEvent(event(), { leaseOwner: "worker_1", now }, mocks);
    expect(mocks.markDeliveryFailed).toHaveBeenCalledWith(
      expect.objectContaining({ nextAttemptAt: null, status: "unknown" }),
    );
    expect(mocks.updateEventState).toHaveBeenLastCalledWith(
      expect.objectContaining({ eventId: "event_1", status: "dead" }),
    );
  });

  it("stops finalization when the delivery lease was lost during send", async () => {
    const mocks = dependencies();
    mocks.markDeliverySent.mockResolvedValueOnce(false);

    await processInterviewNotificationEvent(event(), { leaseOwner: "worker_1", now }, mocks);

    expect(mocks.markDeliverySent).toHaveBeenCalledWith(
      expect.objectContaining({ leaseOwner: "worker_1" }),
    );
    expect(mocks.updateEventState).not.toHaveBeenCalled();
  });
});
