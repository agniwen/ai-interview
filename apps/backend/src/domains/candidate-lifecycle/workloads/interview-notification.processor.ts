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
import type { InterviewNotificationBatchInput } from "../../../background/background.types.js";

export interface InterviewNotificationEventRecord {
  id: string;
  payloadSnapshot: InterviewNotificationPayloadSnapshot;
  type: InterviewNotificationEventType;
}

export interface InterviewNotificationDeliveryRecord {
  attemptCount: number;
  audienceType: InterviewNotificationAudienceType | null;
  channel: InterviewNotificationChannel | null;
  error: string | null;
  id: string;
  lastErrorCode: string | null;
  nextAttemptAt: Date | null;
  providerId: string;
  providerRequestKey: string | null;
  recipientAddress: string | null;
  renderedContent: string | null;
  renderedSubject: string | null;
  status: string;
}

export interface InterviewNotificationProcessorPorts {
  claimDelivery(input: {
    deliveryId: string;
    leaseDurationMs: number;
    leaseOwner: string;
    now: Date;
  }): Promise<InterviewNotificationDeliveryRecord | null>;
  claimEvents(input: InterviewNotificationBatchInput): Promise<InterviewNotificationEventRecord[]>;
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
    payload: InterviewNotificationPayloadSnapshot;
    providerId: string;
    renderedContent: string;
    renderedSubject: string | null;
    type: InterviewNotificationEventType;
  }): Promise<{ providerMessageId: string | null }>;
  updateEventState(input: {
    completedAt?: Date | null;
    eventId: string;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    leaseOwner: string;
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
  ports: InterviewNotificationProcessorPorts,
): Promise<void> {
  const deliveries = await ports.listDeliveries(eventId);
  if (deliveries.length === 0) {
    await ports.updateEventState({
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
    await ports.updateEventState({
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
    await ports.updateEventState({
      eventId,
      lastErrorCode: manual.lastErrorCode ?? "notification-manual-action-required",
      lastErrorMessage: manual.error ?? "通知投递需要人工处理。",
      leaseOwner,
      status: "dead",
    });
    return;
  }
  await ports.updateEventState({ completedAt: now, eventId, leaseOwner, status: "completed" });
}

export async function processInterviewNotificationEvent(
  event: InterviewNotificationEventRecord,
  input: { leaseOwner: string; now: Date },
  ports: InterviewNotificationProcessorPorts,
): Promise<void> {
  const deliveries = await ports.listDeliveries(event.id);
  const deliveryClaimAt = new Date(Math.max(input.now.getTime(), Date.now()));
  for (const delivery of deliveries) {
    if (!["pending", "failed", "sending"].includes(delivery.status)) {
      continue;
    }
    const claimed = await ports.claimDelivery({
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
      const result = await ports.send({
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
      if (
        !(await ports.markDeliverySent({
          deliveryId: claimed.id,
          leaseOwner: input.leaseOwner,
          providerMessageId: result.providerMessageId,
          sentAt: input.now,
        }))
      ) {
        return;
      }
    } catch (error) {
      const failure = classifyInterviewNotificationFailure(error);
      const retryAt =
        failure.kind === "retryable"
          ? getInterviewNotificationRetryAt(claimed.attemptCount, input.now)
          : null;
      let status: "dead" | "failed" | "unknown" = "dead";
      if (failure.kind === "unknown") {
        status = "unknown";
      } else if (retryAt) {
        status = "failed";
      }
      if (
        !(await ports.markDeliveryFailed({
          code: failure.code,
          deliveryId: claimed.id,
          leaseOwner: input.leaseOwner,
          message: failure.message,
          nextAttemptAt: retryAt,
          status,
        }))
      ) {
        return;
      }
    }
  }
  await finalizeEvent(event.id, input.leaseOwner, input.now, ports);
}

/** Claims and processes one DB-leased scheduler batch. */
export async function processInterviewNotificationBatchWorkload(
  input: InterviewNotificationBatchInput,
  ports: InterviewNotificationProcessorPorts,
): Promise<number> {
  const events = await ports.claimEvents(input);
  for (const event of events) {
    await processInterviewNotificationEvent(
      event,
      { leaseOwner: input.leaseOwner, now: input.now },
      ports,
    );
  }
  return events.length;
}
