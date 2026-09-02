import { db } from "../../../../../../../lib/server/db/index";
import { FEISHU_PROVIDER_IDS } from "../../../../../../integrations/feishu/provider";
import {
  account,
  interviewAuditLog,
  member,
  studioInterview,
  studioInterviewNotificationRecipient,
  user,
} from "@app/db-schema/schema";
import { and, asc, eq, inArray } from "drizzle-orm";

export interface InterviewNotificationRecipientRecord {
  email: string;
  feishuBound: boolean;
  feishuProviderIds: string[];
  image: string | null;
  name: string;
  userId: string;
}

export async function interviewRecordExists(
  organizationId: string,
  interviewRecordId: string,
): Promise<boolean> {
  const [record] = await db
    .select({ id: studioInterview.id })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.id, interviewRecordId),
        eq(studioInterview.organizationId, organizationId),
      ),
    )
    .limit(1);
  return Boolean(record);
}

export async function listInterviewNotificationRecipients(
  organizationId: string,
  interviewRecordId: string,
): Promise<InterviewNotificationRecipientRecord[]> {
  const rows = await db
    .select({
      email: user.email,
      image: user.image,
      name: user.name,
      providerId: account.providerId,
      userId: user.id,
    })
    .from(studioInterviewNotificationRecipient)
    .innerJoin(user, eq(user.id, studioInterviewNotificationRecipient.userId))
    .leftJoin(
      account,
      and(eq(account.userId, user.id), inArray(account.providerId, [...FEISHU_PROVIDER_IDS])),
    )
    .where(
      and(
        eq(studioInterviewNotificationRecipient.organizationId, organizationId),
        eq(studioInterviewNotificationRecipient.interviewRecordId, interviewRecordId),
      ),
    )
    .orderBy(asc(user.name), asc(account.providerId));

  const recipients = new Map<string, InterviewNotificationRecipientRecord>();
  for (const row of rows) {
    const existing = recipients.get(row.userId) ?? {
      email: row.email,
      feishuBound: false,
      feishuProviderIds: [],
      image: row.image,
      name: row.name,
      userId: row.userId,
    };
    if (row.providerId && !existing.feishuProviderIds.includes(row.providerId)) {
      existing.feishuProviderIds.push(row.providerId);
      existing.feishuBound = true;
    }
    recipients.set(row.userId, existing);
  }
  return [...recipients.values()];
}

export function replaceInterviewNotificationRecipients(input: {
  actorUserId: string | null;
  interviewRecordId: string;
  organizationId: string;
  userIds: string[];
}): Promise<"not-found" | "ok" | "users-not-members"> {
  return db.transaction(async (tx) => {
    const [record] = await tx
      .select({ id: studioInterview.id })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.interviewRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .for("update")
      .limit(1);
    if (!record) {
      return "not-found";
    }

    if (input.userIds.length > 0) {
      const membershipRows = await tx
        .select({ userId: member.userId })
        .from(member)
        .where(
          and(
            eq(member.organizationId, input.organizationId),
            inArray(member.userId, input.userIds),
          ),
        );
      if (membershipRows.length !== input.userIds.length) {
        return "users-not-members";
      }
    }

    const previous = await tx
      .select({ userId: studioInterviewNotificationRecipient.userId })
      .from(studioInterviewNotificationRecipient)
      .where(eq(studioInterviewNotificationRecipient.interviewRecordId, input.interviewRecordId));
    await tx
      .delete(studioInterviewNotificationRecipient)
      .where(eq(studioInterviewNotificationRecipient.interviewRecordId, input.interviewRecordId));
    if (input.userIds.length > 0) {
      await tx.insert(studioInterviewNotificationRecipient).values(
        input.userIds.map((userId) => ({
          createdBy: input.actorUserId,
          interviewRecordId: input.interviewRecordId,
          organizationId: input.organizationId,
          userId,
        })),
      );
    }
    await tx.insert(interviewAuditLog).values({
      action: "notification_recipients_replaced",
      detail: {
        nextUserIds: input.userIds,
        previousUserIds: previous.map((item) => item.userId),
      },
      id: crypto.randomUUID(),
      interviewRecordId: input.interviewRecordId,
      operatorId: input.actorUserId,
      organizationId: input.organizationId,
    });
    return "ok";
  });
}
