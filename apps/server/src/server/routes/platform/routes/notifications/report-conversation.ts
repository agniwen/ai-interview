import { sql } from "drizzle-orm";
import { recruitingNotificationDelivery, recruitingNotificationEvent } from "@app/db-schema/schema";

// Early Worker deliveries omitted conversation_id; the immutable source event
// retained it. Resolve only that exact event, never the candidate's latest round.
export const reportConversationId = sql<string | null>`coalesce(
  ${recruitingNotificationDelivery.conversationId},
  (select ${recruitingNotificationEvent.conversationId} from ${recruitingNotificationEvent}
   where ${recruitingNotificationEvent.id} = ${recruitingNotificationDelivery.eventId}
     and ${recruitingNotificationEvent.organizationId} = ${recruitingNotificationDelivery.organizationId})
)`;
