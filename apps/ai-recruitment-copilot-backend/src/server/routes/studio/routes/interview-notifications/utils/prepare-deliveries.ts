import { createHash } from "node:crypto";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  account,
  globalConfig,
  interviewNotificationTemplate,
  interviewNotificationTemplateVersion,
  organization,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  studioInterviewNotificationRecipient,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import type {
  InterviewNotificationAudienceType,
  InterviewNotificationChannel,
  InterviewNotificationPayloadSnapshot,
} from "@arc/db-schema/interview-notifications";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { createInterviewNotificationDelivery } from "../dao";
import type { InterviewNotificationEventRecord } from "../dao";
import { renderInterviewNotificationTemplateContent } from "./templates";
import { resolveInternalNotificationUserIds } from "./recipient-policy";
import { resolveInterviewNotificationCompanyName } from "./events";
import {
  buildInterviewerInviteToken,
  buildInviteExpiry,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/human-interview-meeting-access";

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
  targetRole: string | null;
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
  meetingId: string,
  userId: string,
): Promise<string | undefined> {
  const [assignment] = await db
    .select({ role: studioHumanInterviewMeetingInterviewer.role })
    .from(studioHumanInterviewMeetingInterviewer)
    .where(
      and(
        eq(studioHumanInterviewMeetingInterviewer.meetingId, meetingId),
        eq(studioHumanInterviewMeetingInterviewer.userId, userId),
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
  event: InterviewNotificationEventRecord,
): Promise<RecordContext[]> {
  let recordIds = event.interviewRecordId ? [event.interviewRecordId] : [];
  if (recordIds.length === 0 && event.scheduleEntryId) {
    const [schedule] = await db
      .select({ interviewRecordId: studioInterviewSchedule.interviewRecordId })
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.id, event.scheduleEntryId))
      .limit(1);
    recordIds = schedule ? [schedule.interviewRecordId] : [];
  }
  if (recordIds.length === 0 && event.humanMeetingId) {
    const rows = await db
      .select({ interviewRecordId: studioHumanInterviewRound.interviewRecordId })
      .from(studioHumanInterviewMeetingRound)
      .innerJoin(
        studioHumanInterviewRound,
        eq(studioHumanInterviewRound.id, studioHumanInterviewMeetingRound.roundId),
      )
      .where(eq(studioHumanInterviewMeetingRound.meetingId, event.humanMeetingId));
    recordIds = [...new Set(rows.map((row) => row.interviewRecordId))];
  }
  if (recordIds.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      candidateEmail: studioInterview.candidateEmail,
      candidateName: studioInterview.candidateName,
      candidatePhone: studioInterview.candidatePhone,
      configuredCompanyName: globalConfig.companyName,
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
        eq(studioInterview.organizationId, event.organizationId),
        inArray(studioInterview.id, recordIds),
      ),
    );
  return rows.map(({ configuredCompanyName, workspaceName, ...record }) => ({
    ...record,
    companyName: resolveInterviewNotificationCompanyName(configuredCompanyName, workspaceName),
  }));
}

async function loadActiveTemplates(
  event: InterviewNotificationEventRecord,
): Promise<ActiveTemplate[]> {
  const rows = await db
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
  event: InterviewNotificationEventRecord,
  records: RecordContext[],
): Promise<string | null> {
  if (event.scheduleEntryId) {
    const [row] = await db
      .select({ createdBy: studioInterviewSchedule.createdBy })
      .from(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.id, event.scheduleEntryId))
      .limit(1);
    if (row?.createdBy) {
      return row.createdBy;
    }
  }
  if (event.humanMeetingId) {
    const [row] = await db
      .select({ createdBy: studioHumanInterviewMeeting.createdBy })
      .from(studioHumanInterviewMeeting)
      .where(eq(studioHumanInterviewMeeting.id, event.humanMeetingId))
      .limit(1);
    if (row?.createdBy) {
      return row.createdBy;
    }
  }
  return records.find((record) => record.createdBy)?.createdBy ?? null;
}

async function loadUserTargets(
  userIds: string[],
  channel: InterviewNotificationChannel,
  records: RecordContext[],
): Promise<RecipientTarget[]> {
  if (userIds.length === 0 || records.length === 0) {
    return [];
  }
  const users = await db
    .select({ email: user.email, id: user.id, name: user.name })
    .from(user)
    .where(inArray(user.id, userIds));
  const usersById = new Map(users.map((item) => [item.id, item]));

  const accounts = await db
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
  const interviewers = await db
    .select({ userId: studioHumanInterviewMeetingInterviewer.userId })
    .from(studioHumanInterviewMeetingInterviewer)
    .where(eq(studioHumanInterviewMeetingInterviewer.meetingId, event.humanMeetingId));
  return loadUserTargets(
    interviewers.map((item) => item.userId),
    template.channel,
    records,
  );
}

async function payloadForTarget(
  event: InterviewNotificationEventRecord,
  target: RecipientTarget,
  audienceType: InterviewNotificationAudienceType,
): Promise<InterviewNotificationPayloadSnapshot> {
  const interviewerLink =
    audienceType === "meeting_interviewer" && event.humanMeetingId && target.userId
      ? await loadInterviewerMeetingLink(event.humanMeetingId, target.userId)
      : undefined;
  return {
    ...event.payloadSnapshot,
    candidateName: target.record.candidateName,
    companyName: target.record.companyName,
    interviewLink: interviewerLink ?? event.payloadSnapshot.interviewLink,
    jobName: event.payloadSnapshot.jobName ?? target.record.targetRole ?? undefined,
  };
}

export async function prepareInterviewNotificationDeliveries(
  event: InterviewNotificationEventRecord,
): Promise<void> {
  const [records, templates] = await Promise.all([
    loadRecordContexts(event),
    loadActiveTemplates(event),
  ]);
  if (records.length === 0 || templates.length === 0) {
    return;
  }
  const recipientRows = event.humanMeetingId
    ? []
    : await db
        .select({ userId: studioInterviewNotificationRecipient.userId })
        .from(studioInterviewNotificationRecipient)
        .where(
          inArray(
            studioInterviewNotificationRecipient.interviewRecordId,
            records.map((record) => record.id),
          ),
        );
  const selectedUserIds = [...new Set(recipientRows.map((row) => row.userId))];
  const initiatorUserId = await loadInitiatorUserId(event, records);

  for (const template of templates) {
    const targets = await loadTargets(event, template, records, selectedUserIds, initiatorUserId);
    for (const target of targets) {
      const rendered = renderInterviewNotificationTemplateContent(
        template,
        await payloadForTarget(event, target, template.audienceType),
      );
      await createInterviewNotificationDelivery(db, {
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
