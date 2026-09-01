import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { interviewNotification, interviewNotificationEvent } from "@arc/db-schema/schema";
import type { InterviewNotificationDeliveryStatus } from "@arc/db-schema/interview-notifications";
import type { Database } from "../db";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type InterviewNotificationEventRecord = typeof interviewNotificationEvent.$inferSelect;
export type InterviewNotificationDeliveryRecord = typeof interviewNotification.$inferSelect;

export async function claimPendingInterviewNotificationEvents(
  tx: Transaction,
  input: {
    leaseDurationMs: number;
    leaseOwner: string;
    limit?: number;
    now?: Date;
  },
): Promise<InterviewNotificationEventRecord[]> {
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 20), 1), 100);
  const leaseOwner = input.leaseOwner.trim();
  if (!(leaseOwner && Number.isFinite(input.leaseDurationMs) && input.leaseDurationMs > 0)) {
    throw new Error("通知事件租约参数无效。");
  }

  const now = input.now ?? new Date();
  const rows = await tx
    .select()
    .from(interviewNotificationEvent)
    .where(
      and(
        lte(interviewNotificationEvent.availableAt, now),
        lte(interviewNotificationEvent.nextAttemptAt, now),
        or(
          inArray(interviewNotificationEvent.status, ["pending", "failed"]),
          and(
            eq(interviewNotificationEvent.status, "processing"),
            or(
              isNull(interviewNotificationEvent.leaseExpiresAt),
              lte(interviewNotificationEvent.leaseExpiresAt, now),
            ),
          ),
        ),
      ),
    )
    .orderBy(
      asc(interviewNotificationEvent.nextAttemptAt),
      asc(interviewNotificationEvent.createdAt),
    )
    .limit(limit)
    .for("update", { skipLocked: true });

  if (rows.length === 0) {
    return [];
  }

  const leaseExpiresAt = new Date(now.getTime() + input.leaseDurationMs);
  const claimed = await tx
    .update(interviewNotificationEvent)
    .set({
      attemptCount: sql`${interviewNotificationEvent.attemptCount} + 1`,
      lastErrorCode: null,
      lastErrorMessage: null,
      leaseExpiresAt,
      leaseOwner,
      status: "processing",
      updatedAt: now,
    })
    .where(
      inArray(
        interviewNotificationEvent.id,
        rows.map((row) => row.id),
      ),
    )
    .returning();

  const claimedById = new Map(claimed.map((row) => [row.id, row]));
  return rows.flatMap((row) => {
    const updated = claimedById.get(row.id);
    return updated ? [updated] : [];
  });
}

export function listInterviewNotificationDeliveries(
  database: Database,
  eventId: string,
): Promise<InterviewNotificationDeliveryRecord[]> {
  return database
    .select()
    .from(interviewNotification)
    .where(eq(interviewNotification.eventId, eventId))
    .orderBy(asc(interviewNotification.createdAt))
    .execute();
}

export async function claimInterviewNotificationDelivery(
  database: Database,
  input: {
    deliveryId: string;
    leaseDurationMs: number;
    leaseOwner: string;
    now?: Date;
  },
): Promise<InterviewNotificationDeliveryRecord | null> {
  const now = input.now ?? new Date();
  const leaseOwner = input.leaseOwner.trim();
  if (!(leaseOwner && Number.isFinite(input.leaseDurationMs) && input.leaseDurationMs > 0)) {
    throw new Error("通知投递租约参数无效。");
  }
  const [claimed] = await database
    .update(interviewNotification)
    .set({
      attemptCount: sql`${interviewNotification.attemptCount} + 1`,
      error: null,
      lastErrorCode: null,
      leaseExpiresAt: new Date(now.getTime() + input.leaseDurationMs),
      leaseOwner,
      status: "sending",
      updatedAt: now,
    })
    .where(
      and(
        eq(interviewNotification.id, input.deliveryId),
        or(
          and(
            inArray(interviewNotification.status, ["pending", "failed"]),
            or(
              isNull(interviewNotification.nextAttemptAt),
              lte(interviewNotification.nextAttemptAt, now),
            ),
          ),
          and(
            eq(interviewNotification.status, "sending"),
            lte(interviewNotification.leaseExpiresAt, now),
          ),
        ),
      ),
    )
    .returning();
  return claimed ?? null;
}

export async function markInterviewNotificationDeliverySent(
  database: Database,
  input: {
    deliveryId: string;
    leaseOwner: string;
    providerMessageId?: string | null;
    sentAt?: Date;
  },
): Promise<boolean> {
  const sentAt = input.sentAt ?? new Date();
  const [updated] = await database
    .update(interviewNotification)
    .set({
      error: null,
      lastErrorCode: null,
      leaseExpiresAt: null,
      leaseOwner: null,
      nextAttemptAt: null,
      providerMessageId: input.providerMessageId ?? null,
      sentAt,
      status: "sent",
      updatedAt: sentAt,
    })
    .where(
      and(
        eq(interviewNotification.id, input.deliveryId),
        eq(interviewNotification.leaseOwner, input.leaseOwner),
        eq(interviewNotification.status, "sending"),
      ),
    )
    .returning({ id: interviewNotification.id });
  return Boolean(updated);
}

export async function markInterviewNotificationDeliveryFailed(
  database: Database,
  input: {
    code: string;
    deliveryId: string;
    leaseOwner: string;
    message: string;
    nextAttemptAt: Date | null;
    status: Extract<InterviewNotificationDeliveryStatus, "dead" | "failed" | "unknown">;
  },
): Promise<boolean> {
  const now = new Date();
  const [updated] = await database
    .update(interviewNotification)
    .set({
      error: input.message,
      lastErrorCode: input.code,
      leaseExpiresAt: null,
      leaseOwner: null,
      nextAttemptAt: input.nextAttemptAt,
      resultUnknownAt: input.status === "unknown" ? now : null,
      status: input.status,
      updatedAt: now,
    })
    .where(
      and(
        eq(interviewNotification.id, input.deliveryId),
        eq(interviewNotification.leaseOwner, input.leaseOwner),
        eq(interviewNotification.status, "sending"),
      ),
    )
    .returning({ id: interviewNotification.id });
  return Boolean(updated);
}

export async function updateInterviewNotificationEventState(
  database: Database,
  input: {
    completedAt?: Date | null;
    eventId: string;
    leaseOwner: string;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    nextAttemptAt?: Date;
    status: "completed" | "dead" | "failed";
  },
): Promise<boolean> {
  const now = new Date();
  const [updated] = await database
    .update(interviewNotificationEvent)
    .set({
      completedAt: input.completedAt ?? (input.status === "completed" ? now : null),
      lastErrorCode: input.lastErrorCode ?? null,
      lastErrorMessage: input.lastErrorMessage ?? null,
      leaseExpiresAt: null,
      leaseOwner: null,
      nextAttemptAt: input.nextAttemptAt ?? now,
      status: input.status,
      updatedAt: now,
    })
    .where(
      and(
        eq(interviewNotificationEvent.id, input.eventId),
        eq(interviewNotificationEvent.leaseOwner, input.leaseOwner),
        eq(interviewNotificationEvent.status, "processing"),
      ),
    )
    .returning({ id: interviewNotificationEvent.id });
  return Boolean(updated);
}
