import { createDatabase } from "@app/database";
import { aiInterviewRound, recruitingNotificationEvent } from "@app/db-schema/schema";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { expect, it } from "vitest";
import {
  createInterviewNotificationDelivery,
  enqueueInterviewNotificationEvent,
} from "../../../../../../../interview-notifications/dao";

const databaseUrl = process.env.DATABASE_URL;
const target = databaseUrl ? new URL(databaseUrl) : null;
const isLocalTestDatabase =
  target?.hostname === "127.0.0.1" &&
  target.port === "54323" &&
  target.pathname === "/ainterview_local";

it.skipIf(!isLocalTestDatabase)(
  "manual delivery supports a null template reference and deduplicates without persisting test mail",
  async () => {
    if (!databaseUrl) {
      throw new Error("Local database required");
    }
    const client = postgres(databaseUrl, { max: 1 });
    const database = createDatabase(client);
    const rollback = new Error("intentional test rollback");
    const dedupeKey = `manual-invitation-regression:${crypto.randomUUID()}`;
    try {
      await expect(
        database.transaction(async (tx) => {
          const [round] = await tx.select().from(aiInterviewRound).limit(1);
          if (!round) {
            throw new Error("Local test round missing");
          }
          const event = await enqueueInterviewNotificationEvent(tx, {
            dedupeKey,
            interviewRecordId: round.recruitingRecordId,
            organizationId: round.organizationId,
            payloadSnapshot: { schemaVersion: 1, timeZone: "Asia/Shanghai" },
            scheduleEntryId: round.id,
            scopeType: "ai_round",
            type: "ai_interview_invited",
          });
          const input = {
            audienceType: "candidate" as const,
            channel: "email" as const,
            eventId: event.id,
            interviewRecordId: round.recruitingRecordId,
            organizationId: round.organizationId,
            providerId: "resend",
            providerRequestKey: `${event.id}:manual-ai-invitation`,
            recipientAddress: "rollback-test@example.invalid",
            renderedContent: "Never sent: rolled back before commit",
            renderedSubject: "Regression test",
            templateVersionId: null,
            type: "ai_interview_invited" as const,
          };
          await expect(
            tx.transaction(
              async (savepoint) =>
                await createInterviewNotificationDelivery(savepoint, {
                  ...input,
                  templateVersionId: "manual-ai-invitation-v1",
                }),
            ),
          ).rejects.toMatchObject({ cause: { code: "23503" } });
          const delivery = await createInterviewNotificationDelivery(tx, input);
          expect(delivery.templateVersionId).toBeNull();
          const duplicate = await createInterviewNotificationDelivery(tx, input);
          expect(duplicate.id).toBe(delivery.id);
          throw rollback;
        }),
      ).rejects.toBe(rollback);
      const persisted = await database
        .select()
        .from(recruitingNotificationEvent)
        .where(eq(recruitingNotificationEvent.dedupeKey, dedupeKey));
      expect(persisted).toHaveLength(0);
    } finally {
      await client.end();
    }
  },
);
