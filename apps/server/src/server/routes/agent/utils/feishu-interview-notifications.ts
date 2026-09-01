import { and, desc, eq, inArray, isNotNull, isNull, notExists, or } from "drizzle-orm";
import { z } from "zod";
import {
  account,
  interviewConversation,
  interviewNotification,
  organization,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import { db } from "../../../../lib/server/db/index";
import { buildSenderFromAddress, getResendClient } from "../../../../lib/server/resend";
import { getRequiredEnv } from "../../../../lib/server/env";
import { InterviewSummaryCard } from "../../../integrations/feishu/interview-summary-card";
import type { InterviewSummaryQuestionScore } from "../../../integrations/feishu/interview-summary-card";
import { FEISHU_PROVIDER_IDS } from "../../../integrations/feishu/provider";
import type { FeishuProviderId } from "../../../integrations/feishu/provider";
import { ensureInterviewEvaluationDocument } from "./feishu-interview-document";
import {
  formatInterviewNotificationDateTime,
  formatInterviewNotificationDuration,
} from "./interview-notification-format";
import { getGlobalConfig } from "../../studio/routes/global-config/dao";
import { renderInterviewSummaryEmail } from "../../studio/routes/interviews/routes/round-emails/utils/templates";
import { isInterviewQuestionSetComplete } from "@arc/shared/interview/question-outcomes";

const LOG_PREFIX = "[feishu-interview-notification]";
const RETRY_BATCH_SIZE = 20;
const GOOGLE_PROVIDER_ID = "google";

interface SummaryReadyNotificationOptions {
  allowIncomplete?: boolean;
  conversationId: string;
  interviewRecordId: string;
}

export interface ResendInterviewSummaryNotificationResult {
  notificationId: string;
  sentAt: string;
}

interface RecipientAccount {
  accountId: string;
  providerId: FeishuProviderId;
  userId: string;
}

interface EmailRecipient {
  accountId: string;
  email: string;
  providerId: typeof GOOGLE_PROVIDER_ID;
  userId: string;
}

interface NotificationTarget {
  allowIncomplete: boolean;
  conversationId: string;
  interviewRecordId: string;
}

export const evaluationSummarySchema = z.object({
  overallAssessment: z.string().optional(),
  overallScore: z.number().nullable().optional(),
  questions: z
    .array(
      z.object({
        maxScore: z.number(),
        question: z.string(),
        score: z.number().nullable(),
      }),
    )
    .optional(),
  recommendation: z.string().optional(),
});
type EvaluationSummary = z.infer<typeof evaluationSummarySchema>;

function isFeishuProviderId(value: string): value is FeishuProviderId {
  return FEISHU_PROVIDER_IDS.some((providerId) => providerId === value);
}

function buildStudioUrl(roundId: string, organizationSlug: string | null): string {
  const baseUrl = getRequiredEnv("BETTER_AUTH_URL");
  // 多租户路径：/w/[slug]/studio/interviews。query 用 ?roundId= 让名字与
  // 实际值 (studio_interview_schedule.id) 对齐。列表页 useEffect 会同时识别
  // ?roundId= 与历史的 ?recordId=,Panel 内部 resolver 兼容两种 id 类型。
  // organizationSlug 缺失时仍可生成根路径,由 src/app/page.tsx 解析活跃 workspace。
  //
  // Path: /w/[slug]/studio/interviews. The query param uses ?roundId= so the
  // key matches the value (studio_interview_schedule.id). The list page
  // useEffect accepts both ?roundId= (new) and ?recordId= (legacy); the
  // Panel resolves either id type internally.
  const root = baseUrl.replace(/\/$/, "");
  const prefix = organizationSlug ? `/w/${encodeURIComponent(organizationSlug)}` : "";
  return `${root}${prefix}/studio/interviews?roundId=${encodeURIComponent(roundId)}`;
}

function truncateForCard(value: string, maxLength: number): string {
  const trimmed = value.trim().replaceAll(/\s+/g, " ");
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function extractQuestionScores(
  evaluation: EvaluationSummary,
): InterviewSummaryQuestionScore[] {
  const rows = (evaluation.questions ?? []).flatMap((item) =>
    item.score === null
      ? []
      : [
          {
            maxScore: item.maxScore,
            question: truncateForCard(item.question, 28),
            score: item.score,
          },
        ],
  );

  return rows.toSorted((a, b) => a.score / a.maxScore - b.score / b.maxScore).slice(0, 4);
}

interface NotificationCardInput {
  candidateName: string;
  duration: string;
  evaluation: EvaluationSummary;
  interviewStartedAt: string;
  organizationSlug: string | null;
  roundId: string;
  summary: string | null;
  targetRole: string | null;
}

function buildSummaryPayload(input: NotificationCardInput) {
  const overallScore =
    input.evaluation.overallScore === undefined || input.evaluation.overallScore === null
      ? "暂无评分"
      : `${input.evaluation.overallScore}/100`;
  const recommendation = input.evaluation.recommendation ?? "暂无建议";
  const assessment = input.evaluation.overallAssessment ?? null;

  return { assessment, overallScore, recommendation };
}

function buildNotificationCard(input: NotificationCardInput, detailUrl?: string) {
  const { assessment, overallScore, recommendation } = buildSummaryPayload(input);

  const card = InterviewSummaryCard({
    assessment,
    candidateName: input.candidateName,
    detailUrl: detailUrl ?? buildStudioUrl(input.roundId, input.organizationSlug),
    duration: input.duration,
    interviewStartedAt: input.interviewStartedAt,
    overallScore,
    questionScores: extractQuestionScores(input.evaluation),
    recommendation,
    summary: input.summary,
    targetRole: input.targetRole,
  });

  return { card };
}

async function loadNotificationContext(options: SummaryReadyNotificationOptions) {
  const [row] = await db
    .select({
      candidateName: studioInterview.candidateName,
      createdBy: studioInterview.createdBy,
      dataCollectionResults: interviewConversation.dataCollectionResults,
      endedAt: interviewConversation.endedAt,
      evaluationCriteriaResults: interviewConversation.evaluationCriteriaResults,
      interviewQuestions: studioInterview.interviewQuestions,
      organizationId: studioInterview.organizationId,
      organizationSlug: organization.slug,
      qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
      resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
      resumeFileName: studioInterview.resumeFileName,
      resumeStorageKey: studioInterview.resumeStorageKey,
      scheduleEntryId: interviewConversation.scheduleEntryId,
      startedAt: interviewConversation.startedAt,
      summaryStatus: interviewConversation.summaryStatus,
      targetRole: studioInterview.targetRole,
      transcriptSummary: interviewConversation.transcriptSummary,
    })
    .from(interviewConversation)
    .innerJoin(studioInterview, eq(interviewConversation.interviewRecordId, studioInterview.id))
    .leftJoin(organization, eq(studioInterview.organizationId, organization.id))
    .where(eq(interviewConversation.conversationId, options.conversationId))
    .limit(1);

  return row ?? null;
}

async function loadRecipientAccounts(userId: string): Promise<RecipientAccount[]> {
  const rows = await db
    .select({
      accountId: account.accountId,
      providerId: account.providerId,
      userId: account.userId,
    })
    .from(account)
    .where(
      and(
        eq(account.userId, userId),
        inArray(
          account.providerId,
          FEISHU_PROVIDER_IDS.map((providerId) => providerId),
        ),
      ),
    )
    .orderBy(desc(account.updatedAt));

  return rows.flatMap((row) => {
    if (!isFeishuProviderId(row.providerId)) {
      return [];
    }
    return [
      {
        accountId: row.accountId,
        providerId: row.providerId,
        userId: row.userId,
      },
    ];
  });
}

function isGoogleLoginEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

async function loadGoogleEmailRecipient(userId: string): Promise<EmailRecipient | null> {
  if (!isGoogleLoginEnabled()) {
    return null;
  }
  const [row] = await db
    .select({
      email: user.email,
      userId: user.id,
    })
    .from(account)
    .innerJoin(user, eq(user.id, account.userId))
    .where(and(eq(account.userId, userId), eq(account.providerId, GOOGLE_PROVIDER_ID)))
    .orderBy(desc(account.updatedAt))
    .limit(1);

  if (!row?.email) {
    return null;
  }
  return {
    accountId: row.email,
    email: row.email,
    providerId: GOOGLE_PROVIDER_ID,
    userId: row.userId,
  };
}

async function claimNotification({
  conversationId,
  interviewRecordId,
  organizationId,
  recipient,
}: {
  conversationId: string;
  interviewRecordId: string;
  organizationId: string;
  recipient: { accountId: string; providerId: string; userId: string };
}) {
  const [existing] = await db
    .select({
      id: interviewNotification.id,
      status: interviewNotification.status,
    })
    .from(interviewNotification)
    .where(
      and(
        eq(interviewNotification.interviewRecordId, interviewRecordId),
        or(
          eq(interviewNotification.conversationId, conversationId),
          isNull(interviewNotification.conversationId),
        ),
        eq(interviewNotification.type, "summary_ready"),
        eq(interviewNotification.recipientUserId, recipient.userId),
        eq(interviewNotification.providerId, recipient.providerId),
      ),
    )
    .limit(1);

  if (existing?.status === "sent") {
    return null;
  }

  if (existing) {
    await db
      .update(interviewNotification)
      .set({
        conversationId,
        error: null,
        recipientOpenId: recipient.accountId,
        status: "pending",
      })
      .where(eq(interviewNotification.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(interviewNotification)
    .values({
      conversationId,
      id: crypto.randomUUID(),
      interviewRecordId,
      organizationId,
      providerId: recipient.providerId,
      recipientOpenId: recipient.accountId,
      recipientUserId: recipient.userId,
      status: "pending",
      type: "summary_ready",
    })
    .onConflictDoNothing({
      target: [
        interviewNotification.interviewRecordId,
        interviewNotification.conversationId,
        interviewNotification.type,
        interviewNotification.recipientUserId,
        interviewNotification.providerId,
      ],
    })
    .returning({ id: interviewNotification.id });

  return row?.id ?? null;
}

function buildPublicAssetUrl(path: string): string {
  const baseUrl = getRequiredEnv("NEXT_PUBLIC_BASE_URL");
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function markNotificationSent(notificationId: string, messageId: string | null) {
  await db
    .update(interviewNotification)
    .set({
      error: null,
      feishuMessageId: messageId,
      sentAt: new Date(),
      status: "sent",
    })
    .where(eq(interviewNotification.id, notificationId));
}

async function markNotificationFailed(notificationId: string, error: Error) {
  const { message } = error;
  await db
    .update(interviewNotification)
    .set({
      error: message,
      status: "failed",
    })
    .where(eq(interviewNotification.id, notificationId));
}

async function sendGoogleSummaryEmail({
  conversationId,
  context,
  detailUrl,
  interviewRecordId,
  input,
  recipient,
}: {
  conversationId: string;
  context: NonNullable<Awaited<ReturnType<typeof loadNotificationContext>>>;
  detailUrl: string;
  interviewRecordId: string;
  input: NotificationCardInput;
  recipient: EmailRecipient;
}) {
  const notificationId = await claimNotification({
    conversationId,
    interviewRecordId,
    organizationId: context.organizationId,
    recipient,
  });
  if (!notificationId) {
    return;
  }

  try {
    const config = await getGlobalConfig(context.organizationId);
    const { assessment, overallScore, recommendation } = buildSummaryPayload(input);
    const { html, subject, text } = await renderInterviewSummaryEmail({
      assessment,
      candidateName: input.candidateName,
      companyName: config.companyName,
      detailUrl,
      heroImageUrl: buildPublicAssetUrl("/email/interview-clouds-monet.jpg"),
      overallScore,
      recommendation,
      summary: input.summary,
      targetRole: input.targetRole,
    });
    const resend = getResendClient();
    const sendResult = await resend.emails.send({
      from: buildSenderFromAddress(config.companyName),
      html,
      subject,
      text,
      to: recipient.email,
    });

    if (sendResult.error || !sendResult.data) {
      throw new Error(sendResult.error?.message ?? "Resend 未返回 message id");
    }
    await markNotificationSent(notificationId, sendResult.data.id);
  } catch (error) {
    const notificationError = error instanceof Error ? error : new Error(String(error));
    await markNotificationFailed(notificationId, notificationError);
    // eslint-disable-next-line no-console
    console.error(`${LOG_PREFIX} email failed for ${input.roundId}:`, error);
  }
}

export async function resendInterviewSummaryNotification(
  notificationId: string,
): Promise<ResendInterviewSummaryNotificationResult> {
  const [notification] = await db
    .select({
      conversationId: interviewNotification.conversationId,
      id: interviewNotification.id,
      interviewRecordId: interviewNotification.interviewRecordId,
      providerId: interviewNotification.providerId,
      recipientOpenId: interviewNotification.recipientOpenId,
      type: interviewNotification.type,
    })
    .from(interviewNotification)
    .where(eq(interviewNotification.id, notificationId))
    .limit(1);

  if (!notification) {
    throw new Error("通知记录不存在");
  }
  if (notification.type !== "summary_ready") {
    throw new Error("暂不支持重发该类型通知");
  }
  if (!notification.conversationId) {
    throw new Error("通知缺少面试会话，无法重发");
  }
  if (!isFeishuProviderId(notification.providerId)) {
    throw new Error("只支持重发飞书机器人通知");
  }

  const context = await loadNotificationContext({
    conversationId: notification.conversationId,
    interviewRecordId: notification.interviewRecordId,
  });
  if (!context || context.summaryStatus !== "ready") {
    throw new Error("面试报告还未生成完成，无法重发");
  }
  if (!context.scheduleEntryId) {
    throw new Error("通知缺少面试轮次，无法生成报告链接");
  }

  const notificationInput = {
    candidateName: context.candidateName,
    duration: formatInterviewNotificationDuration(context.startedAt, context.endedAt),
    evaluation: evaluationSummarySchema.parse(context.evaluationCriteriaResults ?? {}),
    interviewStartedAt: formatInterviewNotificationDateTime(context.startedAt),
    organizationSlug: context.organizationSlug ?? null,
    roundId: context.scheduleEntryId,
    summary: context.transcriptSummary,
    targetRole: context.targetRole,
  };

  await db
    .update(interviewNotification)
    .set({
      error: null,
      status: "pending",
    })
    .where(eq(interviewNotification.id, notification.id));

  try {
    const documentUrl = await ensureInterviewEvaluationDocument({
      context,
      conversationId: notification.conversationId,
      input: notificationInput,
      interviewRecordId: notification.interviewRecordId,
      notificationId: notification.id,
      providerId: notification.providerId,
      recipientOpenId: notification.recipientOpenId,
    });
    const { card } = buildNotificationCard(notificationInput, documentUrl);
    const { postFeishuDirectCard } = await import("../../../integrations/feishu/bot");
    const sent = await postFeishuDirectCard(
      notification.providerId,
      notification.recipientOpenId,
      card,
    );
    const sentAt = new Date();
    await db
      .update(interviewNotification)
      .set({
        error: null,
        feishuMessageId: sent.id ?? null,
        sentAt,
        status: "sent",
      })
      .where(eq(interviewNotification.id, notification.id));
    return { notificationId: notification.id, sentAt: sentAt.toISOString() };
  } catch (error) {
    const notificationError = error instanceof Error ? error : new Error(String(error));
    await markNotificationFailed(notification.id, notificationError);
    throw error;
  }
}

async function loadMissingGoogleEmailNotificationTargets(
  limit: number,
): Promise<NotificationTarget[]> {
  if (!isGoogleLoginEnabled() || limit <= 0) {
    return [];
  }

  const rows = await db
    .select({
      conversationId: interviewConversation.conversationId,
      interviewRecordId: interviewConversation.interviewRecordId,
    })
    .from(interviewConversation)
    .innerJoin(studioInterview, eq(interviewConversation.interviewRecordId, studioInterview.id))
    .innerJoin(
      studioInterviewSchedule,
      and(
        eq(studioInterviewSchedule.id, interviewConversation.scheduleEntryId),
        eq(studioInterviewSchedule.conversationId, interviewConversation.conversationId),
      ),
    )
    .innerJoin(
      account,
      and(
        eq(account.userId, studioInterview.createdBy),
        eq(account.providerId, GOOGLE_PROVIDER_ID),
      ),
    )
    .innerJoin(user, eq(studioInterview.createdBy, user.id))
    .where(
      and(
        eq(interviewConversation.summaryStatus, "ready"),
        isNotNull(interviewConversation.interviewRecordId),
        isNotNull(studioInterview.createdBy),
        isNotNull(user.email),
        notExists(
          db
            .select({ id: interviewNotification.id })
            .from(interviewNotification)
            .where(
              and(
                eq(interviewNotification.interviewRecordId, studioInterview.id),
                eq(interviewNotification.conversationId, interviewConversation.conversationId),
                eq(interviewNotification.type, "summary_ready"),
                eq(interviewNotification.recipientUserId, studioInterview.createdBy),
                eq(interviewNotification.providerId, GOOGLE_PROVIDER_ID),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(interviewConversation.updatedAt))
    .limit(limit);

  return rows.flatMap((row) => {
    if (!row.interviewRecordId) {
      return [];
    }
    return [
      {
        allowIncomplete: false,
        conversationId: row.conversationId,
        interviewRecordId: row.interviewRecordId,
      },
    ];
  });
}

export async function notifyInterviewSummaryReady(
  options: SummaryReadyNotificationOptions,
): Promise<void> {
  const context = await loadNotificationContext(options);
  if (!context || context.summaryStatus !== "ready" || !context.createdBy) {
    return;
  }
  if (!(options.allowIncomplete || isInterviewQuestionSetComplete(context.dataCollectionResults))) {
    return;
  }

  const recipients = await loadRecipientAccounts(context.createdBy);

  // 没有 scheduleEntryId 时跳过通知 —— 链接会落到一个 404 的 dialog,不如不发,
  // 让 retryFailedInterviewSummaryNotifications 后续重试 (届时 schedule 可能已回填)。
  // Skip when scheduleEntryId is missing — the link would 404 inside the
  // detail dialog. Leave the notification in `pending` so the retry pass
  // picks it up once the schedule entry is backfilled.
  if (!context.scheduleEntryId) {
    return;
  }

  const notificationInput = {
    candidateName: context.candidateName,
    duration: formatInterviewNotificationDuration(context.startedAt, context.endedAt),
    evaluation: evaluationSummarySchema.parse(context.evaluationCriteriaResults ?? {}),
    interviewStartedAt: formatInterviewNotificationDateTime(context.startedAt),
    organizationSlug: context.organizationSlug ?? null,
    roundId: context.scheduleEntryId,
    summary: context.transcriptSummary,
    targetRole: context.targetRole,
  };
  const detailUrl = buildStudioUrl(context.scheduleEntryId, context.organizationSlug ?? null);

  if (recipients.length > 0) {
    const { postFeishuDirectCard } = await import("../../../integrations/feishu/bot");

    for (const recipient of recipients) {
      const notificationId = await claimNotification({
        conversationId: options.conversationId,
        interviewRecordId: options.interviewRecordId,
        organizationId: context.organizationId,
        recipient,
      });
      if (!notificationId) {
        continue;
      }

      try {
        const documentUrl = await ensureInterviewEvaluationDocument({
          context,
          conversationId: options.conversationId,
          input: notificationInput,
          interviewRecordId: options.interviewRecordId,
          notificationId,
          providerId: recipient.providerId,
          recipientOpenId: recipient.accountId,
        });
        const { card } = buildNotificationCard(notificationInput, documentUrl);
        const sent = await postFeishuDirectCard(recipient.providerId, recipient.accountId, card);
        await markNotificationSent(notificationId, sent.id ?? null);
      } catch (error) {
        const notificationError = error instanceof Error ? error : new Error(String(error));
        await markNotificationFailed(notificationId, notificationError);
        // eslint-disable-next-line no-console
        console.error(`${LOG_PREFIX} failed for ${options.conversationId}:`, error);
      }
    }
  }

  const emailRecipient = await loadGoogleEmailRecipient(context.createdBy);
  if (emailRecipient) {
    await sendGoogleSummaryEmail({
      context,
      conversationId: options.conversationId,
      detailUrl,
      input: notificationInput,
      interviewRecordId: options.interviewRecordId,
      recipient: emailRecipient,
    });
  }
}

export async function retryFailedInterviewSummaryNotifications(): Promise<{
  retried: number;
}> {
  const failedRows = await db
    .select({
      conversationId: interviewNotification.conversationId,
      interviewRecordId: interviewNotification.interviewRecordId,
    })
    .from(interviewNotification)
    .where(
      and(
        eq(interviewNotification.type, "summary_ready"),
        inArray(interviewNotification.status, ["failed", "pending"]),
      ),
    )
    .limit(RETRY_BATCH_SIZE);
  const failedTargets: NotificationTarget[] = failedRows.flatMap((row) =>
    row.conversationId
      ? [
          {
            allowIncomplete: true,
            conversationId: row.conversationId,
            interviewRecordId: row.interviewRecordId,
          },
        ]
      : [],
  );
  const missingGoogleEmailRows = await loadMissingGoogleEmailNotificationTargets(RETRY_BATCH_SIZE);

  let retried = 0;
  const seen = new Set<string>();
  for (const row of [...failedTargets, ...missingGoogleEmailRows]) {
    if (!row.conversationId) {
      continue;
    }
    const key = `${row.interviewRecordId}:${row.conversationId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    await notifyInterviewSummaryReady({
      allowIncomplete: row.allowIncomplete,
      conversationId: row.conversationId,
      interviewRecordId: row.interviewRecordId,
    });
    retried += 1;
  }

  return { retried };
}
