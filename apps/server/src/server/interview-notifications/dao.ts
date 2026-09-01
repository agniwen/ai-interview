import type { Database } from "../../lib/server/db/index";
import {
  interviewNotificationEventTypeSchema,
  interviewNotificationPayloadSnapshotSchema,
  interviewNotificationScopeTypeSchema,
} from "@arc/db-schema/interview-notifications";
import type {
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
  InterviewNotificationDeliveryStatus,
  InterviewNotificationEventType,
  InterviewNotificationPayloadSnapshot,
  InterviewNotificationScopeType,
} from "@arc/db-schema/interview-notifications";
import { interviewNotification, interviewNotificationEvent } from "@arc/db-schema/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type NotificationDatabase = Omit<Database, "$client" | "transaction">;

const enqueueNotificationEventInputSchema = z
  .object({
    actorUserId: z.string().trim().min(1).nullable().optional(),
    availableAt: z.date().optional(),
    conversationId: z.string().trim().min(1).nullable().optional(),
    dedupeKey: z.string().trim().min(1).max(500),
    humanMeetingId: z.string().trim().min(1).nullable().optional(),
    humanRoundId: z.string().trim().min(1).nullable().optional(),
    id: z.string().trim().min(1).optional(),
    interviewRecordId: z.string().trim().min(1).nullable().optional(),
    nextAttemptAt: z.date().optional(),
    organizationId: z.string().trim().min(1),
    payloadSnapshot: interviewNotificationPayloadSnapshotSchema,
    scheduleEntryId: z.string().trim().min(1).nullable().optional(),
    scopeType: interviewNotificationScopeTypeSchema,
    type: interviewNotificationEventTypeSchema,
  })
  .superRefine((input, context) => {
    const requiredScopeId = {
      ai_round: input.scheduleEntryId,
      human_meeting: input.humanMeetingId,
      interview_record: input.interviewRecordId,
    } satisfies Record<InterviewNotificationScopeType, string | null | undefined>;
    if (!requiredScopeId[input.scopeType]) {
      context.addIssue({
        code: "custom",
        message: `通知作用域 ${input.scopeType} 缺少对应实体 ID。`,
        path: ["scopeType"],
      });
    }
  });

export interface EnqueueInterviewNotificationEventInput {
  actorUserId?: string | null;
  availableAt?: Date;
  conversationId?: string | null;
  dedupeKey: string;
  humanMeetingId?: string | null;
  humanRoundId?: string | null;
  id?: string;
  interviewRecordId?: string | null;
  nextAttemptAt?: Date;
  organizationId: string;
  payloadSnapshot: InterviewNotificationPayloadSnapshot;
  scheduleEntryId?: string | null;
  scopeType: InterviewNotificationScopeType;
  type: InterviewNotificationEventType;
}

export type InterviewNotificationEventRecord = typeof interviewNotificationEvent.$inferSelect;
export type InterviewNotificationDeliveryRecord = typeof interviewNotification.$inferSelect;

export function validateInterviewNotificationEventInput(
  input: EnqueueInterviewNotificationEventInput,
): EnqueueInterviewNotificationEventInput {
  return enqueueNotificationEventInputSchema.parse(input);
}

export async function enqueueInterviewNotificationEvent(
  tx: Transaction,
  input: EnqueueInterviewNotificationEventInput,
): Promise<InterviewNotificationEventRecord> {
  const parsed = validateInterviewNotificationEventInput(input);
  const now = new Date();
  const [created] = await tx
    .insert(interviewNotificationEvent)
    .values({
      actorUserId: parsed.actorUserId ?? null,
      availableAt: parsed.availableAt ?? now,
      conversationId: parsed.conversationId ?? null,
      dedupeKey: parsed.dedupeKey,
      humanMeetingId: parsed.humanMeetingId ?? null,
      humanRoundId: parsed.humanRoundId ?? null,
      id: parsed.id ?? crypto.randomUUID(),
      interviewRecordId: parsed.interviewRecordId ?? null,
      nextAttemptAt: parsed.nextAttemptAt ?? parsed.availableAt ?? now,
      organizationId: parsed.organizationId,
      payloadSnapshot: parsed.payloadSnapshot,
      scheduleEntryId: parsed.scheduleEntryId ?? null,
      scopeType: parsed.scopeType,
      type: parsed.type,
    })
    .onConflictDoNothing({ target: interviewNotificationEvent.dedupeKey })
    .returning();

  if (created) {
    return created;
  }

  const [existing] = await tx
    .select()
    .from(interviewNotificationEvent)
    .where(eq(interviewNotificationEvent.dedupeKey, parsed.dedupeKey))
    .limit(1);
  if (!existing) {
    throw new Error("通知事件写入冲突后无法读取现有记录。");
  }
  if (existing.organizationId !== parsed.organizationId || existing.type !== parsed.type) {
    throw new Error("通知事件去重键与现有事件不一致。");
  }
  return existing;
}

export async function loadInterviewNotificationEvent(
  database: Database,
  eventId: string,
): Promise<InterviewNotificationEventRecord | null> {
  const [event] = await database
    .select()
    .from(interviewNotificationEvent)
    .where(eq(interviewNotificationEvent.id, eventId))
    .limit(1);
  return event ?? null;
}

export interface CreateInterviewNotificationDeliveryInput {
  audienceType: InterviewNotificationAudienceType;
  channel: InterviewNotificationChannel;
  error?: string | null;
  eventId: string;
  id?: string;
  interviewRecordId: string;
  lastErrorCode?: string | null;
  nextAttemptAt?: Date | null;
  organizationId: string;
  providerId: string;
  providerRequestKey: string;
  recipientAddress: string;
  recipientDisplayName?: string | null;
  recipientUserId?: string | null;
  renderedContent: string;
  renderedSubject?: string | null;
  status?: InterviewNotificationDeliveryStatus;
  templateVersionId: string;
  type: InterviewNotificationEventType;
}

export async function createInterviewNotificationDelivery(
  database: NotificationDatabase,
  input: CreateInterviewNotificationDeliveryInput,
): Promise<InterviewNotificationDeliveryRecord> {
  const [created] = await database
    .insert(interviewNotification)
    .values({
      audienceType: input.audienceType,
      channel: input.channel,
      error: input.error ?? null,
      eventId: input.eventId,
      id: input.id ?? crypto.randomUUID(),
      interviewRecordId: input.interviewRecordId,
      lastErrorCode: input.lastErrorCode ?? null,
      nextAttemptAt: input.nextAttemptAt ?? new Date(),
      organizationId: input.organizationId,
      providerId: input.providerId,
      providerRequestKey: input.providerRequestKey,
      recipientAddress: input.recipientAddress,
      recipientDisplayName: input.recipientDisplayName ?? null,
      recipientOpenId: input.recipientAddress,
      recipientUserId: input.recipientUserId ?? null,
      renderedContent: input.renderedContent,
      renderedSubject: input.renderedSubject ?? null,
      status: input.status ?? "pending",
      templateVersionId: input.templateVersionId,
      type: input.type,
    })
    // provider_request_key is protected by a partial unique index (non-null only).
    // PostgreSQL cannot infer that index from ON CONFLICT(provider_request_key)
    // without the matching predicate; target-less DO NOTHING handles the partial
    // unique conflict and we verify the existing row below.
    .onConflictDoNothing()
    .returning();

  if (created) {
    return created;
  }
  const [existing] = await database
    .select()
    .from(interviewNotification)
    .where(eq(interviewNotification.providerRequestKey, input.providerRequestKey))
    .limit(1);
  if (!existing || existing.eventId !== input.eventId) {
    throw new Error("通知投递去重键与现有记录不一致。");
  }
  return existing;
}
