import { lockRecruitingRecord } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { db } from "../../../../../../../lib/server/db/index";
import { FEISHU_PROVIDER_IDS } from "../../../../../../integrations/feishu/provider";
import {
  account,
  recruitingEvent,
  member,
  recruitingNotificationRecipient,
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
    .select({ id: recruitingRecordReadModel.id })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, interviewRecordId),
        eq(recruitingRecordReadModel.organizationId, organizationId),
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
    .from(recruitingNotificationRecipient)
    .innerJoin(user, eq(user.id, recruitingNotificationRecipient.userId))
    .leftJoin(
      account,
      and(eq(account.userId, user.id), inArray(account.providerId, [...FEISHU_PROVIDER_IDS])),
    )
    .where(
      and(
        eq(recruitingNotificationRecipient.organizationId, organizationId),
        eq(recruitingNotificationRecipient.recruitingRecordId, interviewRecordId),
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
    await lockRecruitingRecord(tx, input.interviewRecordId, input.organizationId);
    const [record] = await tx
      .select({ id: recruitingRecordReadModel.id })
      .from(recruitingRecordReadModel)
      .where(
        and(
          eq(recruitingRecordReadModel.id, input.interviewRecordId),
          eq(recruitingRecordReadModel.organizationId, input.organizationId),
        ),
      )

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
      .select({ userId: recruitingNotificationRecipient.userId })
      .from(recruitingNotificationRecipient)
      .where(eq(recruitingNotificationRecipient.recruitingRecordId, input.interviewRecordId));
    await tx
      .delete(recruitingNotificationRecipient)
      .where(eq(recruitingNotificationRecipient.recruitingRecordId, input.interviewRecordId));
    if (input.userIds.length > 0) {
      await tx.insert(recruitingNotificationRecipient).values(
        input.userIds.map((userId) => ({
          createdBy: input.actorUserId,
          organizationId: input.organizationId,
          recruitingRecordId: input.interviewRecordId,
          userId,
        })),
      );
    }
    await tx.insert(recruitingEvent).values({
      action: "notification_recipients_replaced",
      detail: {
        nextUserIds: input.userIds,
        previousUserIds: previous.map((item) => item.userId),
      },
      id: crypto.randomUUID(),
      operatorId: input.actorUserId,
      organizationId: input.organizationId,
      recruitingRecordId: input.interviewRecordId,
    });
    return "ok";
  });
}
