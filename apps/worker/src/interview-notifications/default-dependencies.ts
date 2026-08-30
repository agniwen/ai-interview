import { db } from "@app/server/lib/server/db";
import {
  claimInterviewNotificationDelivery,
  claimPendingInterviewNotificationEvents,
  listInterviewNotificationDeliveries,
  markInterviewNotificationDeliveryFailed,
  markInterviewNotificationDeliverySent,
  updateInterviewNotificationEventState,
} from "@app/server/server/routes/studio/routes/interview-notifications/dao";
import { sendInterviewNotification } from "@app/server/server/routes/studio/routes/interview-notifications/utils/channel-adapters";
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
