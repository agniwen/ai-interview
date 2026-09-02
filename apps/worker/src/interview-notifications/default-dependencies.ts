import { db } from "../db";
import {
  claimInterviewNotificationDelivery,
  claimPendingInterviewNotificationEvents,
  listInterviewNotificationDeliveries,
  markInterviewNotificationDeliveryFailed,
  markInterviewNotificationDeliverySent,
  updateInterviewNotificationEventState,
} from "./dao";
import { sendInterviewNotification } from "./channel-adapters";
import type { InterviewNotificationProcessorDependencies } from "./processor";

export const defaultInterviewNotificationProcessorDependencies = {
  claimDelivery: (input) => claimInterviewNotificationDelivery(db, input),
  listDeliveries: (eventId) => listInterviewNotificationDeliveries(db, eventId),
  markDeliveryFailed: (input) => markInterviewNotificationDeliveryFailed(db, input),
  markDeliverySent: (input) => markInterviewNotificationDeliverySent(db, input),
  send: sendInterviewNotification,
  updateEventState: (input) => updateInterviewNotificationEventState(db, input),
} satisfies InterviewNotificationProcessorDependencies;

export function claimInterviewNotificationEvents(input: {
  leaseDurationMs: number;
  leaseOwner: string;
  limit: number;
  now?: Date;
}) {
  return db.transaction((tx) => claimPendingInterviewNotificationEvents(tx, input));
}
