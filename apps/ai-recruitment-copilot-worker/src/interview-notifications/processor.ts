import type {
  InterviewNotificationDeliveryRecord,
  InterviewNotificationEventRecord,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-notifications/dao";
import type {
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
  InterviewNotificationEventType,
  InterviewNotificationPayloadSnapshot,
} from "@arc/db-schema/interview-notifications";
import {
  classifyInterviewNotificationFailure,
  getInterviewNotificationRetryAt,
} from "@arc/shared/interview-notifications";

export interface InterviewNotificationSendResult {
  providerMessageId: string | null;
}

export interface InterviewNotificationProcessorDependencies {
  claimDelivery(input: {
    deliveryId: string;
    leaseDurationMs: number;
    leaseOwner: string;
    now: Date;
  }): Promise<InterviewNotificationDeliveryRecord | null>;
  listDeliveries(eventId: string): Promise<InterviewNotificationDeliveryRecord[]>;
  markDeliveryFailed(input: {
    code: string;
    deliveryId: string;
    leaseOwner: string;
    message: string;
    nextAttemptAt: Date | null;
    status: "dead" | "failed" | "unknown";
  }): Promise<boolean>;
  markDeliverySent(input: {
    deliveryId: string;
    leaseOwner: string;
    providerMessageId: string | null;
    sentAt: Date;
  }): Promise<boolean>;
  send(input: {
    address: string;
    audienceType: InterviewNotificationAudienceType;
    channel: InterviewNotificationChannel;
    idempotencyKey: string;
    providerId: string;
    payload: InterviewNotificationPayloadSnapshot;
    renderedContent: string;
    renderedSubject: string | null;
    type: InterviewNotificationEventType;
  }): Promise<InterviewNotificationSendResult>;
  updateEventState(input: {
    completedAt?: Date | null;
    eventId: string;
    leaseOwner: string;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    nextAttemptAt?: Date;
    status: "completed" | "dead" | "failed";
  }): Promise<boolean>;
}

const DELIVERY_LEASE_DURATION_MS = 60_000;

function earliestRetryAt(deliveries: InterviewNotificationDeliveryRecord[], now: Date): Date {
  const timestamps = deliveries.flatMap((delivery) =>
    delivery.nextAttemptAt ? [delivery.nextAttemptAt.getTime()] : [],
  );
  return timestamps.length > 0 ? new Date(Math.min(...timestamps)) : now;
}

async function finalizeEvent(
  eventId: string,
  leaseOwner: string,
  now: Date,
  dependencies: InterviewNotificationProcessorDependencies,
): Promise<void> {
  const deliveries = await dependencies.listDeliveries(eventId);
  if (deliveries.length === 0) {
    await dependencies.updateEventState({
      eventId,
      lastErrorCode: "notification-no-delivery",
      lastErrorMessage: "通知事件没有可发送的接收人或模板。",
      leaseOwner,
      status: "dead",
    });
    return;
  }

  const retryable = deliveries.filter((delivery) =>
    ["pending", "sending", "failed"].includes(delivery.status),
  );
  if (retryable.length > 0) {
    await dependencies.updateEventState({
      eventId,
      lastErrorCode: "notification-delivery-pending",
      lastErrorMessage: "通知事件仍有待发送或待重试的投递。",
      leaseOwner,
      nextAttemptAt: earliestRetryAt(retryable, now),
      status: "failed",
    });
    return;
  }

  const manual = deliveries.find((delivery) => ["dead", "unknown"].includes(delivery.status));
  if (manual) {
    await dependencies.updateEventState({
      eventId,
      lastErrorCode: manual.lastErrorCode ?? "notification-manual-action-required",
      lastErrorMessage: manual.error ?? "通知投递需要人工处理。",
      leaseOwner,
      status: "dead",
    });
    return;
  }

  await dependencies.updateEventState({
    completedAt: now,
    eventId,
    leaseOwner,
    status: "completed",
  });
}

export async function processInterviewNotificationEvent(
  event: InterviewNotificationEventRecord,
  input: { leaseOwner: string; now?: Date },
  dependencies: InterviewNotificationProcessorDependencies,
): Promise<void> {
  const now = input.now ?? new Date();
  const deliveries = await dependencies.listDeliveries(event.id);
  // Delivery preparation may insert rows a few milliseconds after the event's
  // claim timestamp. Use a fresh claim time so those new rows are immediately
  // eligible instead of forcing the whole event through an unnecessary retry.
  const deliveryClaimAt = new Date(Math.max(now.getTime(), Date.now()));

  for (const delivery of deliveries) {
    if (!["pending", "failed", "sending"].includes(delivery.status)) {
      continue;
    }
    const claimed = await dependencies.claimDelivery({
      deliveryId: delivery.id,
      leaseDurationMs: DELIVERY_LEASE_DURATION_MS,
      leaseOwner: input.leaseOwner,
      now: deliveryClaimAt,
    });
    if (
      !claimed?.audienceType ||
      !claimed.channel ||
      !claimed.recipientAddress ||
      !claimed.providerRequestKey
    ) {
      continue;
    }

    try {
      const result = await dependencies.send({
        address: claimed.recipientAddress,
        audienceType: claimed.audienceType,
        channel: claimed.channel,
        idempotencyKey: claimed.providerRequestKey,
        payload: event.payloadSnapshot,
        providerId: claimed.providerId,
        renderedContent: claimed.renderedContent ?? "",
        renderedSubject: claimed.renderedSubject,
        type: event.type,
      });
      const completed = await dependencies.markDeliverySent({
        deliveryId: claimed.id,
        leaseOwner: input.leaseOwner,
        providerMessageId: result.providerMessageId,
        sentAt: now,
      });
      if (!completed) {
        return;
      }
    } catch (error) {
      const failure = classifyInterviewNotificationFailure(error);
      const retryAt =
        failure.kind === "retryable"
          ? getInterviewNotificationRetryAt(claimed.attemptCount, now)
          : null;
      let status: "dead" | "failed" | "unknown" = "dead";
      if (failure.kind === "unknown") {
        status = "unknown";
      } else if (retryAt) {
        status = "failed";
      }
      const completed = await dependencies.markDeliveryFailed({
        code: failure.code,
        deliveryId: claimed.id,
        leaseOwner: input.leaseOwner,
        message: failure.message,
        nextAttemptAt: retryAt,
        status,
      });
      if (!completed) {
        return;
      }
    }
  }

  await finalizeEvent(event.id, input.leaseOwner, now, dependencies);
}
