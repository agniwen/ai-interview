import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { createHash } from "node:crypto";
import {
  account,
  globalConfig,
  jobDescription,
  interviewNotificationTemplate,
  interviewNotificationTemplateVersion,
  organization,
  humanInterviewMeeting,
  humanInterviewMeetingInterviewer,
  humanInterviewMeetingRound,
  humanInterviewRound,
  recruitingNotificationRecipient,
  aiInterviewRound,
  user,
} from "@app/db-schema/schema";
import type {
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
  InterviewNotificationPayloadSnapshot,
} from "@app/db-schema/interview-notifications";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { createInterviewNotificationDelivery } from "../dao";
import type { InterviewNotificationEventRecord, NotificationDatabase } from "../dao";
import { renderInterviewNotificationTemplateContent } from "./templates";
import { resolveInternalNotificationUserIds } from "./recipient-policy";
import {
  buildInterviewerInviteToken,
  buildInviteExpiry,
} from "../../routes/studio/routes/interviews/dao/human-interview-meeting-access";

const FEISHU_PROVIDER_IDS = ["feishu", "feishu-jiguang-hr"] as const;

export function resolvePreferredInternalNotificationChannel(
  hasFeishuAccount: boolean,
): "email" | "feishu" {
  return hasFeishuAccount ? "feishu" : "email";
}

export function shouldResolveSelectedHrAudience(event: { humanMeetingId: string | null }): boolean {
  return event.humanMeetingId === null;
}

export function shouldResolveInitiatorAudience(event: {
  humanMeetingId: string | null;
  type: InterviewNotificationEventRecord["type"];
}): boolean {
  return !(event.humanMeetingId && event.type === "human_interview_confirmed");
}

interface RecordContext {
  candidateEmail: string | null;
  candidateName: string;
  candidatePhone: string | null;
  companyName: string;
  createdBy: string | null;
  id: string;
  jobName: string | null;
}

interface RecipientTarget {
  address: string;
  displayName: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  providerId: string;
  record: RecordContext;
  userId: string | null;
}

interface ActiveTemplate {
  audienceType: InterviewNotificationAudienceType;
  channel: InterviewNotificationChannel;
  contentTemplate: string;
  organizationId: string | null;
  subjectTemplate: string | null;
  versionId: string;
}

export function selectPreferredInterviewNotificationTemplates(
  rows: ActiveTemplate[],
): ActiveTemplate[] {
  const selected = new Map<string, ActiveTemplate>();
  for (const row of rows.toSorted(
    (left, right) => Number(right.organizationId !== null) - Number(left.organizationId !== null),
  )) {
    const key = `${row.audienceType}:${row.channel}`;
    if (!selected.has(key)) {
      selected.set(key, row);
    }
  }
  return [...selected.values()];
}

function normalizeEmail(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function normalizePhone(value: string | null): string | null {
  const normalized = value?.replaceAll(/[\s()-]/g, "").trim();
  return normalized || null;
}

function providerRequestKey(eventId: string, channel: string, address: string): string {
  const recipientHash = createHash("sha256").update(address).digest("hex").slice(0, 24);
  return `${eventId}:${channel}:${recipientHash}`;
}

function absoluteAppUrl(path: string): string {
  const baseUrl = process.env.BETTER_AUTH_URL?.trim() || process.env.NEXT_PUBLIC_BASE_URL?.trim();
  return baseUrl ? `${baseUrl.replace(/\/$/, "")}${path}` : path;
}

async function loadInterviewerMeetingLink(
  database: NotificationDatabase,
  meetingId: string,
  userId: string,
): Promise<string | undefined> {
  const [assignment] = await database
    .select({ role: humanInterviewMeetingInterviewer.role })
    .from(humanInterviewMeetingInterviewer)
    .where(
      and(
        eq(humanInterviewMeetingInterviewer.meetingId, meetingId),
        eq(humanInterviewMeetingInterviewer.userId, userId),
      ),
    )
    .limit(1);
  if (!assignment) {
    return undefined;
  }
  const token = buildInterviewerInviteToken({
    exp: buildInviteExpiry(),
    meetingId,
    role: assignment.role,
    userId,
  });
  return absoluteAppUrl(`/human-interview/interviewer/${encodeURIComponent(token)}`);
}

async function loadRecordContexts(
  database: NotificationDatabase,
  event: InterviewNotificationEventRecord,
): Promise<RecordContext[]> {
  let recordIds = event.recruitingRecordId ? [event.recruitingRecordId] : [];
  if (recordIds.length === 0 && event.aiRoundId) {
    const [schedule] = await database
      .select({ interviewRecordId: aiInterviewRound.recruitingRecordId })
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.id, event.aiRoundId))
      .limit(1);
    recordIds = schedule ? [schedule.interviewRecordId] : [];
  }
  if (recordIds.length === 0 && event.humanMeetingId) {
    const rows = await database
      .select({ interviewRecordId: humanInterviewRound.recruitingRecordId })
      .from(humanInterviewMeetingRound)
      .innerJoin(
        humanInterviewRound,
        eq(humanInterviewRound.id, humanInterviewMeetingRound.roundId),
      )
      .where(eq(humanInterviewMeetingRound.meetingId, event.humanMeetingId));
    recordIds = [...new Set(rows.map((row) => row.interviewRecordId))];
  }
  if (recordIds.length === 0) {
    return [];
  }
  const rows = await database
    .select({
      candidateEmail: recruitingRecordReadModel.candidateEmail,
      candidateName: recruitingRecordReadModel.candidateName,
      candidatePhone: recruitingRecordReadModel.candidatePhone,
      configuredCompanyName: globalConfig.companyName,
      createdBy: recruitingRecordReadModel.createdBy,
      id: recruitingRecordReadModel.id,
      jobName: sql<
        string | null
      >`coalesce(${jobDescription.name}, ${recruitingRecordReadModel.targetRole})`,
      workspaceName: organization.name,
    })
    .from(recruitingRecordReadModel)
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .innerJoin(organization, eq(organization.id, recruitingRecordReadModel.organizationId))
    .leftJoin(
      globalConfig,
      eq(globalConfig.organizationId, recruitingRecordReadModel.organizationId),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, event.organizationId),
        inArray(recruitingRecordReadModel.id, recordIds),
      ),
    );
  return rows.map(({ configuredCompanyName, workspaceName, ...record }) => ({
    ...record,
    companyName: configuredCompanyName?.trim() || workspaceName,
  }));
}

async function loadActiveTemplates(
  database: NotificationDatabase,
  event: InterviewNotificationEventRecord,
): Promise<ActiveTemplate[]> {
  const rows = await database
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

  return selectPreferredInterviewNotificationTemplates(rows);
}

async function loadInitiatorUserId(
  database: NotificationDatabase,
  event: InterviewNotificationEventRecord,
  records: RecordContext[],
): Promise<string | null> {
  if (event.aiRoundId) {
    const [row] = await database
      .select({ createdBy: aiInterviewRound.createdBy })
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.id, event.aiRoundId))
      .limit(1);
    if (row?.createdBy) {
      return row.createdBy;
    }
  }
  if (event.humanMeetingId) {
    const [row] = await database
      .select({ createdBy: humanInterviewMeeting.createdBy })
      .from(humanInterviewMeeting)
      .where(eq(humanInterviewMeeting.id, event.humanMeetingId))
      .limit(1);
    if (row?.createdBy) {
      return row.createdBy;
    }
  }
  return records.find((record) => record.createdBy)?.createdBy ?? null;
}

async function loadUserTargets(
  database: NotificationDatabase,
  userIds: string[],
  channel: InterviewNotificationChannel,
  records: RecordContext[],
): Promise<RecipientTarget[]> {
  if (userIds.length === 0 || records.length === 0) {
    return [];
  }
  const users = await database
    .select({ email: user.email, id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, userIds));
  const usersById = new Map(users.map((item) => [item.id, item]));

  const accounts = await database
    .select({
      accountId: account.accountId,
      providerId: account.providerId,
      userId: account.userId,
    })
    .from(account)
    .where(
      and(inArray(account.userId, userIds), inArray(account.providerId, [...FEISHU_PROVIDER_IDS])),
    )
    .orderBy(desc(account.updatedAt));
  const accountByUserId = new Map<string, (typeof accounts)[number]>();
  for (const item of accounts) {
    if (!accountByUserId.has(item.userId)) {
      accountByUserId.set(item.userId, item);
    }
  }
  const preferredUserIds = userIds.filter(
    (userId) =>
      resolvePreferredInternalNotificationChannel(accountByUserId.has(userId)) === channel,
  );

  if (channel === "feishu") {
    return preferredUserIds.map((userId) => {
      const person = usersById.get(userId);
      const bound = accountByUserId.get(userId);
      if (!bound) {
        throw new Error("飞书通知渠道解析结果不一致。");
      }
      return {
        address: bound.accountId,
        displayName: person?.name ?? null,
        errorCode: null,
        errorMessage: null,
        providerId: bound.providerId,
        record: records[0],
        userId,
      };
    });
  }

  return preferredUserIds.map((userId) => {
    const person = usersById.get(userId);
    const email = normalizeEmail(person?.email ?? null);
    return {
      address: email ?? `missing-email:${userId}`,
      displayName: person?.name ?? null,
      errorCode: email ? null : "recipient-email-missing",
      errorMessage: email ? null : "通知人员没有可用邮箱。",
      providerId: "resend",
      record: records[0],
      userId,
    };
  });
}

async function loadTargets(
  database: NotificationDatabase,
  event: InterviewNotificationEventRecord,
  template: ActiveTemplate,
  records: RecordContext[],
  selectedUserIds: string[],
  initiatorUserId: string | null,
): Promise<RecipientTarget[]> {
  if (template.audienceType === "candidate") {
    return records.map((record) => {
      const address =
        template.channel === "email"
          ? normalizeEmail(record.candidateEmail)
          : normalizePhone(record.candidatePhone);
      return {
        address: address ?? `missing-${template.channel}:${record.id}`,
        displayName: record.candidateName,
        errorCode: address ? null : `candidate-${template.channel}-missing`,
        errorMessage: address
          ? null
          : `候选人没有可用的${template.channel === "email" ? "邮箱" : "手机号"}。`,
        providerId: template.channel === "email" ? "resend" : "sms",
        record,
        userId: null,
      };
    });
  }
  if (template.audienceType === "selected_hr_user") {
    if (!shouldResolveSelectedHrAudience(event)) {
      return [];
    }
    return loadUserTargets(
      database,
      resolveInternalNotificationUserIds({
        audienceType: template.audienceType,
        initiatorUserId,
        selectedUserIds,
      }),
      template.channel,
      records,
    );
  }
  if (template.audienceType === "initiator_fallback") {
    if (!shouldResolveInitiatorAudience(event)) {
      return [];
    }
    return loadUserTargets(
      database,
      resolveInternalNotificationUserIds({
        audienceType: template.audienceType,
        initiatorUserId,
        selectedUserIds,
      }),
      template.channel,
      records,
    );
  }
  if (!event.humanMeetingId) {
    return [];
  }
  const interviewers = await database
    .select({ userId: humanInterviewMeetingInterviewer.userId })
    .from(humanInterviewMeetingInterviewer)
    .where(
      and(
        eq(humanInterviewMeetingInterviewer.meetingId, event.humanMeetingId),
        event.type === "human_evaluation_summary_ready"
          ? ne(humanInterviewMeetingInterviewer.role, "observer")
          : undefined,
      ),
    );
  return loadUserTargets(
    database,
    interviewers.map((item) => item.userId),
    template.channel,
    records,
  );
}

export function usesInterviewerMeetingLink(
  type: InterviewNotificationEventRecord["type"],
): boolean {
  return type !== "human_evaluation_summary_ready";
}

async function payloadForTarget(
  database: NotificationDatabase,
  event: InterviewNotificationEventRecord,
  target: RecipientTarget,
  audienceType: InterviewNotificationAudienceType,
): Promise<InterviewNotificationPayloadSnapshot> {
  const interviewerLink =
    audienceType === "meeting_interviewer" &&
    usesInterviewerMeetingLink(event.type) &&
    event.humanMeetingId &&
    target.userId
      ? await loadInterviewerMeetingLink(database, event.humanMeetingId, target.userId)
      : undefined;
  return {
    ...event.payloadSnapshot,
    candidateName: target.record.candidateName,
    companyName: target.record.companyName,
    interviewLink: interviewerLink ?? event.payloadSnapshot.interviewLink,
    jobName: event.payloadSnapshot.jobName ?? target.record.jobName ?? undefined,
  };
}

export async function prepareInterviewNotificationDeliveries(
  event: InterviewNotificationEventRecord,
  database: NotificationDatabase,
): Promise<void> {
  const records = await loadRecordContexts(database, event);
  const templates = await loadActiveTemplates(database, event);
  if (records.length === 0 || templates.length === 0) {
    return;
  }
  const recipientRows = event.humanMeetingId
    ? []
    : await database
        .select({ userId: recruitingNotificationRecipient.userId })
        .from(recruitingNotificationRecipient)
        .where(
          inArray(
            recruitingNotificationRecipient.recruitingRecordId,
            records.map((record) => record.id),
          ),
        );
  const selectedUserIds = [...new Set(recipientRows.map((row) => row.userId))];
  const initiatorUserId = await loadInitiatorUserId(database, event, records);

  for (const template of templates) {
    const targets = await loadTargets(
      database,
      event,
      template,
      records,
      selectedUserIds,
      initiatorUserId,
    );
    for (const target of targets) {
      const rendered = renderInterviewNotificationTemplateContent(
        template,
        await payloadForTarget(database, event, target, template.audienceType),
      );
      await createInterviewNotificationDelivery(database, {
        audienceType: template.audienceType,
        channel: template.channel,
        error: target.errorMessage,
        eventId: event.id,
        interviewRecordId: target.record.id,
        lastErrorCode: target.errorCode,
        nextAttemptAt: target.errorCode ? null : new Date(),
        organizationId: event.organizationId,
        providerId: target.providerId,
        providerRequestKey: providerRequestKey(event.id, template.channel, target.address),
        recipientAddress: target.address,
        recipientDisplayName: target.displayName,
        recipientUserId: target.userId,
        renderedContent: rendered.content,
        renderedSubject: rendered.subject,
        status: target.errorCode ? "dead" : "pending",
        templateVersionId: template.versionId,
        type: event.type,
      });
    }
  }
}
