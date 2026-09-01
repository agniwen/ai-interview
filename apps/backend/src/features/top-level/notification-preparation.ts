/* oxlint-disable complexity, no-nested-ternary, no-use-before-define, unicorn/no-await-expression-member, unicorn/no-nested-ternary -- Recipient resolution, channel policy, and serial delivery preparation form one copied transactional notification workflow; mutually recursive helpers preserve its ordering. */
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  account,
  globalConfig,
  interviewNotification,
  interviewNotificationEvent,
  interviewNotificationTemplate,
  interviewNotificationTemplateVersion,
  organization,
  studioHumanInterviewMeetingInterviewer,
  studioInterview,
  studioInterviewNotificationRecipient,
  user,
} from "@arc/db-schema/schema";
import type {
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
} from "@arc/db-schema/interview-notifications";
import { renderInterviewNotificationTemplate } from "@arc/shared/interview-notifications";
import type { TopLevelDatabasePort } from "./top-level.ports.js";

type EventInsert = typeof interviewNotificationEvent.$inferInsert;
type Event = typeof interviewNotificationEvent.$inferSelect;
type NotificationDatabase = Parameters<Parameters<TopLevelDatabasePort["transaction"]>[0]>[0];

function requestKey(eventId: string, channel: string, address: string) {
  return `${eventId}:${channel}:${createHash("sha256").update(address).digest("hex").slice(0, 24)}`;
}

function normalizeEmail(value: string | null) {
  return value?.trim().toLocaleLowerCase() || null;
}

function normalizePhone(value: string | null) {
  return value?.replaceAll(/[\s()-]/gu, "").trim() || null;
}

export async function enqueuePreparedNotificationEvent(
  database: NotificationDatabase,
  input: EventInsert,
) {
  const [created] = await database
    .insert(interviewNotificationEvent)
    .values(input)
    .onConflictDoNothing({ target: interviewNotificationEvent.dedupeKey })
    .returning();
  const event =
    created ??
    (
      await database
        .select()
        .from(interviewNotificationEvent)
        .where(eq(interviewNotificationEvent.dedupeKey, input.dedupeKey))
        .limit(1)
    )[0];
  if (!event) {
    throw new Error("通知事件写入冲突后无法读取现有记录。");
  }
  await prepareDeliveries(database, event);
  return event;
}

async function prepareDeliveries(database: NotificationDatabase, event: Event) {
  if (!event.interviewRecordId) {
    return;
  }
  const [record] = await database
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      companyName: globalConfig.companyName,
      createdBy: studioInterview.createdBy,
      id: studioInterview.id,
      targetRole: studioInterview.targetRole,
      workspaceName: organization.name,
    })
    .from(studioInterview)
    .innerJoin(organization, eq(organization.id, studioInterview.organizationId))
    .leftJoin(globalConfig, eq(globalConfig.organizationId, studioInterview.organizationId))
    .where(
      and(
        eq(studioInterview.id, event.interviewRecordId),
        eq(studioInterview.organizationId, event.organizationId),
      ),
    )
    .limit(1);
  if (!record) {
    return;
  }
  const templateRows = await database
    .select({
      audienceType: interviewNotificationTemplate.audienceType,
      channel: interviewNotificationTemplate.channel,
      contentTemplate: interviewNotificationTemplateVersion.contentTemplate,
      organizationId: interviewNotificationTemplate.organizationId,
      subjectTemplate: interviewNotificationTemplateVersion.subjectTemplate,
      versionId: interviewNotificationTemplateVersion.id,
    })
    .from(interviewNotificationTemplate)
    .innerJoin(
      interviewNotificationTemplateVersion,
      eq(interviewNotificationTemplate.activeVersionId, interviewNotificationTemplateVersion.id),
    )
    .where(
      and(
        eq(interviewNotificationTemplate.eventType, event.type),
        eq(interviewNotificationTemplate.enabled, true),
        eq(interviewNotificationTemplate.locale, "zh-CN"),
        eq(interviewNotificationTemplateVersion.status, "published"),
        or(
          eq(interviewNotificationTemplate.organizationId, event.organizationId),
          isNull(interviewNotificationTemplate.organizationId),
        ),
      ),
    )
    .orderBy(desc(interviewNotificationTemplate.updatedAt));
  const templates = new Map<string, (typeof templateRows)[number]>();
  for (const template of templateRows.toSorted(
    (left, right) => Number(right.organizationId !== null) - Number(left.organizationId !== null),
  )) {
    const key = `${template.audienceType}:${template.channel}`;
    if (!templates.has(key)) {
      templates.set(key, template);
    }
  }
  if (templates.size === 0) {
    return;
  }
  const selected = event.humanMeetingId
    ? []
    : await database
        .select({ userId: studioInterviewNotificationRecipient.userId })
        .from(studioInterviewNotificationRecipient)
        .where(eq(studioInterviewNotificationRecipient.interviewRecordId, event.interviewRecordId));
  const interviewerRows = event.humanMeetingId
    ? await database
        .select({ userId: studioHumanInterviewMeetingInterviewer.userId })
        .from(studioHumanInterviewMeetingInterviewer)
        .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, event.humanMeetingId))
    : [];
  const selectedIds = [...new Set(selected.map((row) => row.userId))];
  const allUserIds = [
    ...new Set([
      ...selectedIds,
      ...interviewerRows.map((row) => row.userId),
      ...(record.createdBy ? [record.createdBy] : []),
    ]),
  ];
  const [users, accounts] = await Promise.all([
    allUserIds.length
      ? database
          .select({ email: user.email, id: user.id, name: user.name })
          .from(user)
          .where(inArray(user.id, allUserIds))
      : [],
    allUserIds.length
      ? database
          .select({
            accountId: account.accountId,
            providerId: account.providerId,
            userId: account.userId,
          })
          .from(account)
          .where(
            and(
              inArray(account.userId, allUserIds),
              inArray(account.providerId, ["feishu", "feishu-jiguang-hr"]),
            ),
          )
          .orderBy(desc(account.updatedAt))
      : [],
  ]);
  const usersById = new Map(users.map((person) => [person.id, person]));
  const accountsById = new Map<string, (typeof accounts)[number]>();
  for (const binding of accounts) {
    if (!accountsById.has(binding.userId)) {
      accountsById.set(binding.userId, binding);
    }
  }

  for (const template of templates.values()) {
    const targets = resolveTargets({
      accountsById,
      audienceType: template.audienceType,
      candidateEmail: record.candidateEmail,
      candidateName: record.candidateName,
      candidatePhone: record.candidatePhone,
      channel: template.channel,
      initiatorId: record.createdBy,
      interviewerIds: interviewerRows.map((row) => row.userId),
      selectedIds,
      usersById,
    });
    for (const target of targets) {
      const payload = {
        ...event.payloadSnapshot,
        candidateName: record.candidateName,
        companyName: record.companyName?.trim() || record.workspaceName,
        jobName: event.payloadSnapshot.jobName ?? record.targetRole ?? undefined,
      };
      await database
        .insert(interviewNotification)
        .values({
          audienceType: template.audienceType,
          channel: template.channel,
          error: target.error,
          eventId: event.id,
          id: crypto.randomUUID(),
          interviewRecordId: record.id,
          lastErrorCode: target.errorCode,
          nextAttemptAt: target.errorCode ? null : new Date(),
          organizationId: event.organizationId,
          providerId: target.providerId,
          providerRequestKey: requestKey(event.id, template.channel, target.address),
          recipientAddress: target.address,
          recipientDisplayName: target.name,
          recipientOpenId: target.address,
          recipientUserId: target.userId,
          renderedContent: renderInterviewNotificationTemplate(template.contentTemplate, payload),
          renderedSubject: template.subjectTemplate
            ? renderInterviewNotificationTemplate(template.subjectTemplate, payload)
            : null,
          status: target.errorCode ? "dead" : "pending",
          templateVersionId: template.versionId,
          type: event.type,
        })
        .onConflictDoNothing();
    }
  }
}

function resolveTargets(input: {
  accountsById: Map<string, { accountId: string; providerId: string; userId: string }>;
  audienceType: InterviewNotificationAudienceType;
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  channel: InterviewNotificationChannel;
  initiatorId: string | null;
  interviewerIds: string[];
  selectedIds: string[];
  usersById: Map<string, { email: string; id: string; name: string }>;
}) {
  if (input.audienceType === "candidate") {
    const address =
      input.channel === "email"
        ? normalizeEmail(input.candidateEmail)
        : normalizePhone(input.candidatePhone);
    return [
      {
        address: address ?? `missing-${input.channel}`,
        error: address
          ? null
          : `候选人没有可用的${input.channel === "email" ? "邮箱" : "手机号"}。`,
        errorCode: address ? null : `candidate-${input.channel}-missing`,
        name: input.candidateName,
        providerId: input.channel === "email" ? "resend" : "sms",
        userId: null,
      },
    ];
  }
  const ids =
    input.audienceType === "selected_hr_user"
      ? input.selectedIds
      : input.audienceType === "meeting_interviewer"
        ? input.interviewerIds
        : input.selectedIds.length === 0 && input.initiatorId
          ? [input.initiatorId]
          : [];
  return ids.flatMap((id) => {
    const person = input.usersById.get(id);
    const binding = input.accountsById.get(id);
    const preferredChannel = binding ? "feishu" : "email";
    if (preferredChannel !== input.channel) {
      return [];
    }
    const address = binding?.accountId ?? normalizeEmail(person?.email ?? null);
    return [
      {
        address: address ?? `missing-email:${id}`,
        error: address ? null : "通知人员没有可用邮箱。",
        errorCode: address ? null : "recipient-email-missing",
        name: person?.name ?? null,
        providerId: binding?.providerId ?? "resend",
        userId: id,
      },
    ];
  });
}
