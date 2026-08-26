/* oxlint-disable require-await, no-useless-undefined -- Vitest mocks preserve Promise-shaped dependency contracts. */
import { describe, expect, it, vi } from "vitest";
import type {
  InterviewNotificationDeliveryRecord,
  InterviewNotificationEventRecord,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-notifications/dao";
import { InterviewNotificationProviderError } from "@arc/shared/interview-notifications";
import type { InterviewNotificationProcessorDependencies } from "./processor";
import { processInterviewNotificationEvent } from "./processor";

const now = new Date("2026-08-20T02:00:00.000Z");

function event(): InterviewNotificationEventRecord {
  return {
    actorUserId: "user_1",
    attemptCount: 1,
    availableAt: now,
    completedAt: null,
    conversationId: "conversation_1",
    createdAt: now,
    dedupeKey: "ai_report_ready:conversation_1:1",
    humanMeetingId: null,
    humanRoundId: null,
    id: "event_1",
    interviewRecordId: "record_1",
    lastErrorCode: null,
    lastErrorMessage: null,
    leaseExpiresAt: new Date(now.getTime() + 60_000),
    leaseOwner: "worker_1",
    nextAttemptAt: now,
    organizationId: "org_1",
    payloadSnapshot: { schemaVersion: 1, timeZone: "Asia/Shanghai" },
    scheduleEntryId: null,
    scopeType: "interview_record",
    status: "processing",
    type: "ai_report_ready",
    updatedAt: now,
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
    interviewRecordId: "record_1",
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

function dependencies() {
  let rows = [delivery()];
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
    }),
    markDeliverySent: vi.fn(async (input) => {
      rows = [
        {
          ...rows[0],
          providerMessageId: input.providerMessageId,
          status: "sent",
        },
      ];
    }),
    prepareDeliveries: vi.fn(async () => undefined),
    send: vi.fn(async () => ({ providerMessageId: "provider_1" })),
    updateEventState: vi.fn(async () => undefined),
  } satisfies InterviewNotificationProcessorDependencies;
  return mocks;
}

describe("interview notification processor", () => {
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
        payload: notificationEvent.payloadSnapshot,
        type: "ai_report_ready",
      }),
    );
    expect(mocks.markDeliverySent).toHaveBeenCalledWith({
      deliveryId: "delivery_1",
      providerMessageId: "provider_1",
      sentAt: now,
    });
    expect(mocks.updateEventState).toHaveBeenLastCalledWith({
      completedAt: now,
      eventId: "event_1",
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
});
