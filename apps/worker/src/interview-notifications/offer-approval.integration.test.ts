import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import postgres from "postgres";
import { eq, sql } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import {
  recruitingNotificationEvent as events,
  recruitingNotificationDelivery as deliveries,
} from "@app/db-schema/schema";
import { createDatabase } from "@app/database";
import { cancelApprovalRemindersTx } from "@app/database/offer-approval";
import { InterviewNotificationProviderError } from "@app/shared/interview-notifications";
import {
  claimInterviewNotificationDelivery,
  listInterviewNotificationDeliveries,
  markInterviewNotificationDeliverySent,
  markInterviewNotificationDeliveryFailed,
  updateInterviewNotificationEventState,
} from "./dao";
import { processInterviewNotificationEvent } from "./processor";

const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
describe.skipIf(!testUrl)("审批撤回与外部投递交错", () => {
  if (testUrl && !new URL(testUrl).pathname.includes("_test_")) {
    throw new Error("必须使用隔离测试库");
  }
  const client = postgres(testUrl ?? "postgres://localhost/unused", { max: 1 });
  const db = createDatabase(client);
  const now = new Date();
  beforeAll(async () => {
    // Connection-local tables exercise real PostgreSQL predicates and lease CAS without fixtures in persistent tables.
    for (const table of [events, deliveries]) {
      const config = getTableConfig(table);
      const columns = config.columns.map(
        (column) => sql`${sql.identifier(column.name)} ${sql.raw(column.getSQLType())}`,
      );
      await db.execute(
        sql`create temporary table ${sql.identifier(config.name)} (${sql.join(columns, sql`, `)})`,
      );
    }
  });
  beforeEach(async () => {
    await db.delete(deliveries);
    await db.delete(events);
  });
  afterAll(() => client.end());

  async function fixture(queue: "production" | "test-offer") {
    const [event] = await db
      .insert(events)
      .values({
        attemptCount: 1,
        availableAt: now,
        createdAt: now,
        dedupeKey: "approval-event",
        id: "event",
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        leaseOwner: "worker",
        nextAttemptAt: now,
        organizationId: "org",
        payloadSnapshot: {
          offerApproval: {
            approvalId: "approval",
            recipientUserId: "approver",
            status: "pending",
            stepId: "step",
          },
          schemaVersion: 1,
          timeZone: "Asia/Shanghai",
        },
        queueNamespace: queue,
        recruitingRecordId: "record",
        scopeType: "offer_approval",
        status: queue === "production" ? "processing" : "isolated_processing",
        type: "offer_approval_pending",
        updatedAt: now,
      })
      .returning();
    if (!event) {
      throw new Error("通知创建失败");
    }
    await db.insert(deliveries).values({
      attemptCount: 0,
      audienceType: "offer_approval_user",
      channel: "feishu",
      createdAt: now,
      eventId: event.id,
      id: "delivery",
      nextAttemptAt: now,
      organizationId: "org",
      providerId: "feishu-jiguang-hr",
      providerRequestKey: "event:approver",
      recipientAddress: "open-id",
      recipientOpenId: "open-id",
      recipientUserId: "approver",
      recruitingRecordId: "record",
      renderedContent: "待审批",
      status: "pending",
      type: "offer_approval_pending",
      updatedAt: now,
    });
    return event;
  }

  it.each(["production", "test-offer"] as const)(
    "%s 队列取消后不能再认领待发投递",
    async (queue) => {
      await fixture(queue);
      await db.transaction((tx) => cancelApprovalRemindersTx(tx, "approval", now));
      const [row] = await db.select().from(deliveries);
      expect(row?.status).toBe("cancelled");
      expect(
        await claimInterviewNotificationDelivery(db, {
          deliveryId: "delivery",
          leaseDurationMs: 60_000,
          leaseOwner: "worker",
          now,
        }),
      ).toBeNull();
    },
  );

  it.each([
    ["production", "sent"],
    ["test-offer", "sent"],
    ["production", "unknown"],
    ["test-offer", "unknown"],
  ] as const)("%s 队列在发送中撤回后仍保存 %s 结果", async (queue, outcome) => {
    const event = await fixture(queue);
    await processInterviewNotificationEvent(
      event,
      { leaseOwner: "worker", now },
      {
        claimDelivery: (input) => claimInterviewNotificationDelivery(db, input),
        listDeliveries: (id) => listInterviewNotificationDeliveries(db, id),
        markDeliveryFailed: (input) => markInterviewNotificationDeliveryFailed(db, input),
        markDeliverySent: (input) => markInterviewNotificationDeliverySent(db, input),
        prepareApprovalEvent: () => Promise.resolve(),
        send: async () => {
          await db.transaction((tx) => cancelApprovalRemindersTx(tx, "approval", now));
          const [inFlight] = await db.select().from(deliveries);
          expect(inFlight?.status).toBe("sending");
          expect(inFlight?.leaseOwner).toBe("worker");
          if (outcome === "unknown") {
            throw new InterviewNotificationProviderError({
              code: "timeout",
              kind: "unknown",
              message: "外部发送结果未知",
            });
          }
          return { providerMessageId: "feishu-message" };
        },
        updateEventState: (input) => updateInterviewNotificationEventState(db, input),
        validateApprovalDelivery: () => Promise.resolve(true),
      },
    );
    const [row] = await db.select().from(deliveries);
    expect(row?.status).toBe(outcome);
    expect(row?.providerMessageId).toBe(outcome === "sent" ? "feishu-message" : null);
    if (outcome === "unknown") {
      expect(row?.resultUnknownAt).toBeInstanceOf(Date);
    }
    const [cancelled] = await db.select().from(events).where(eq(events.id, event.id));
    expect(cancelled?.status).toBe("cancelled");
  });
});
