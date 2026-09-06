import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, desc, eq, inArray, isNotNull, isNull, notExists, or } from "drizzle-orm";
import { z } from "zod";
import {
  account,
  aiInterviewConversation,
  recruitingNotificationDelivery,
  member,
  organization,
  aiInterviewRound,
  user,
} from "@app/db-schema/schema";
import { db } from "../../../../lib/server/db/index";
import { buildSenderFromAddress, getResendClient } from "../../../../lib/server/resend";
import { getRequiredEnv } from "../../../../lib/server/env";
import { InterviewSummaryCard } from "../../../integrations/feishu/interview-summary-card";
import type { InterviewSummaryQuestionAnswer } from "../../../integrations/feishu/interview-summary-card";
import { FEISHU_PROVIDER_IDS } from "../../../integrations/feishu/provider";
import type { FeishuProviderId } from "../../../integrations/feishu/provider";
import { ensureInterviewEvaluationDocument } from "./feishu-interview-document";
import { extractNotificationCardSupplement } from "./feishu-interview-notification-card";
import {
  formatInterviewNotificationDateTime,
  formatInterviewNotificationDuration,
} from "./interview-notification-format";
import { getGlobalConfig } from "../../studio/routes/global-config/dao";
import { renderInterviewSummaryEmail } from "../../studio/routes/interviews/routes/round-emails/utils/templates";
import { isInterviewQuestionSetComplete } from "@app/shared/interview/question-outcomes";

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

interface NotificationCardInput {
  candidateName: string;
  duration: string;
  evaluation: EvaluationSummary;
  interviewQuestions: string[];
  interviewStartedAt: string;
  organizationSlug: string | null;
  questionAnswers: InterviewSummaryQuestionAnswer[];
  resumeEvaluation: string | null;
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
    interviewQuestions: input.interviewQuestions,
    interviewStartedAt: input.interviewStartedAt,
    overallScore,
    questionAnswers: input.questionAnswers,
    recommendation,
    resumeEvaluation: input.resumeEvaluation,
    summary: input.summary,
    targetRole: input.targetRole,
  });

  return { card };
}

async function loadNotificationContext(options: SummaryReadyNotificationOptions) {
  const [row] = await db
    .select({
      candidateName: recruitingRecordReadModel.candidateName,
      createdBy: recruitingRecordReadModel.createdBy,
      dataCollectionResults: aiInterviewConversation.dataCollectionResults,
      endedAt: aiInterviewConversation.endedAt,
      evaluationCriteriaResults: aiInterviewConversation.evaluationCriteriaResults,
      interviewQuestions: recruitingRecordReadModel.interviewQuestions,
      organizationId: recruitingRecordReadModel.organizationId,
      organizationSlug: organization.slug,
      qualitativeResumeEvaluation: recruitingRecordReadModel.qualitativeResumeEvaluation,
      resumeEvaluationArtifactMode: recruitingRecordReadModel.resumeEvaluationArtifactMode,
      resumeFileName: recruitingRecordReadModel.resumeFileName,
      resumeStorageKey: recruitingRecordReadModel.resumeStorageKey,
      scheduleEntryId: aiInterviewConversation.aiRoundId,
      startedAt: aiInterviewConversation.startedAt,
      summaryStatus: aiInterviewConversation.summaryStatus,
      targetRole: recruitingRecordReadModel.targetRole,
      transcriptSummary: aiInterviewConversation.transcriptSummary,
    })
    .from(aiInterviewConversation)
    .innerJoin(
      recruitingRecordReadModel,
      eq(aiInterviewConversation.recruitingRecordId, recruitingRecordReadModel.id),
    )
    .leftJoin(organization, eq(recruitingRecordReadModel.organizationId, organization.id))
    .where(eq(aiInterviewConversation.conversationId, options.conversationId))
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
      id: recruitingNotificationDelivery.id,
      status: recruitingNotificationDelivery.status,
    })
    .from(recruitingNotificationDelivery)
    .where(
      and(
        eq(recruitingNotificationDelivery.recruitingRecordId, interviewRecordId),
        or(
          eq(recruitingNotificationDelivery.conversationId, conversationId),
          isNull(recruitingNotificationDelivery.conversationId),
        ),
        eq(recruitingNotificationDelivery.type, "summary_ready"),
        eq(recruitingNotificationDelivery.recipientUserId, recipient.userId),
        eq(recruitingNotificationDelivery.providerId, recipient.providerId),
      ),
    )
    .limit(1);

  if (existing?.status === "sent") {
    return null;
  }

  if (existing) {
    await db
      .update(recruitingNotificationDelivery)
      .set({
        conversationId,
        error: null,
        recipientOpenId: recipient.accountId,
        status: "pending",
      })
      .where(eq(recruitingNotificationDelivery.id, existing.id));
    return existing.id;
  }

  const [row] = await db
    .insert(recruitingNotificationDelivery)
    .values({
      conversationId,
      id: crypto.randomUUID(),
      organizationId,
      providerId: recipient.providerId,
      recipientOpenId: recipient.accountId,
      recipientUserId: recipient.userId,
      recruitingRecordId: interviewRecordId,
      status: "pending",
      type: "summary_ready",
    })
    .onConflictDoNothing({
      target: [
        recruitingNotificationDelivery.recruitingRecordId,
        recruitingNotificationDelivery.conversationId,
        recruitingNotificationDelivery.type,
        recruitingNotificationDelivery.recipientUserId,
        recruitingNotificationDelivery.providerId,
      ],
    })
    .returning({ id: recruitingNotificationDelivery.id });

  return row?.id ?? null;
}

function buildPublicAssetUrl(path: string): string {
  const baseUrl = getRequiredEnv("NEXT_PUBLIC_BASE_URL");
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

async function markNotificationSent(notificationId: string, messageId: string | null) {
  await db
    .update(recruitingNotificationDelivery)
    .set({
      error: null,
      feishuMessageId: messageId,
      sentAt: new Date(),
      status: "sent",
    })
    .where(eq(recruitingNotificationDelivery.id, notificationId));
}

async function markNotificationFailed(notificationId: string, error: Error) {
  const { message } = error;
  await db
    .update(recruitingNotificationDelivery)
    .set({
      error: message,
      status: "failed",
    })
    .where(eq(recruitingNotificationDelivery.id, notificationId));
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
  recipientUserId?: string,
): Promise<ResendInterviewSummaryNotificationResult> {
  const [notification] = await db
    .select({
      conversationId: recruitingNotificationDelivery.conversationId,
      id: recruitingNotificationDelivery.id,
      interviewRecordId: recruitingNotificationDelivery.recruitingRecordId,
      organizationId: recruitingNotificationDelivery.organizationId,
      providerId: recruitingNotificationDelivery.providerId,
      recipientOpenId: recruitingNotificationDelivery.recipientOpenId,
      recipientUserId: recruitingNotificationDelivery.recipientUserId,
      type: recruitingNotificationDelivery.type,
    })
    .from(recruitingNotificationDelivery)
    .where(eq(recruitingNotificationDelivery.id, notificationId))
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
    ...extractNotificationCardSupplement(context),
    interviewStartedAt: formatInterviewNotificationDateTime(context.startedAt),
    organizationSlug: context.organizationSlug ?? null,
    roundId: context.scheduleEntryId,
    summary: context.transcriptSummary,
    targetRole: context.targetRole,
  };

  let resendNotificationId = notification.id;
  let resendRecipientOpenId = notification.recipientOpenId;
  let resendRecipientUserId = notification.recipientUserId;
  if (recipientUserId && recipientUserId !== notification.recipientUserId) {
    const [recipient] = await db
      .select({ accountId: account.accountId })
      .from(member)
      .innerJoin(
        account,
        and(eq(account.userId, member.userId), eq(account.providerId, notification.providerId)),
      )
      .where(
        and(
          eq(member.organizationId, notification.organizationId),
          eq(member.userId, recipientUserId),
        ),
      )
      .orderBy(desc(account.updatedAt))
      .limit(1);
    if (!recipient) {
      throw new Error("所选用户不是当前工作区内已绑定对应飞书机器人的成员");
    }

    const insertedId = crypto.randomUUID();
    const [inserted] = await db
      .insert(recruitingNotificationDelivery)
      .values({
        conversationId: notification.conversationId,
        id: insertedId,
        organizationId: notification.organizationId,
        providerId: notification.providerId,
        recipientOpenId: recipient.accountId,
        recipientUserId,
        recruitingRecordId: notification.interviewRecordId,
        status: "pending",
        type: notification.type,
      })
      .onConflictDoNothing({
        target: [
          recruitingNotificationDelivery.recruitingRecordId,
          recruitingNotificationDelivery.conversationId,
          recruitingNotificationDelivery.type,
          recruitingNotificationDelivery.recipientUserId,
          recruitingNotificationDelivery.providerId,
        ],
      })
      .returning({ id: recruitingNotificationDelivery.id });
    if (inserted) {
      resendNotificationId = inserted.id;
    } else {
      const [existing] = await db
        .select({ id: recruitingNotificationDelivery.id })
        .from(recruitingNotificationDelivery)
        .where(
          and(
            eq(recruitingNotificationDelivery.recruitingRecordId, notification.interviewRecordId),
            eq(recruitingNotificationDelivery.conversationId, notification.conversationId),
            eq(recruitingNotificationDelivery.type, notification.type),
            eq(recruitingNotificationDelivery.recipientUserId, recipientUserId),
            eq(recruitingNotificationDelivery.providerId, notification.providerId),
          ),
        )
        .limit(1);
      if (!existing) {
        throw new Error("无法创建所选接收人的飞书通知记录");
      }
      resendNotificationId = existing.id;
    }
    resendRecipientOpenId = recipient.accountId;
    resendRecipientUserId = recipientUserId;
  }

  await db
    .update(recruitingNotificationDelivery)
    .set({
      error: null,
      recipientOpenId: resendRecipientOpenId,
      recipientUserId: resendRecipientUserId,
      status: "pending",
    })
    .where(eq(recruitingNotificationDelivery.id, resendNotificationId));

  try {
    const documentUrl = await ensureInterviewEvaluationDocument({
      context,
      conversationId: notification.conversationId,
      input: notificationInput,
      interviewRecordId: notification.interviewRecordId,
      notificationId: resendNotificationId,
      providerId: notification.providerId,
      recipientOpenId: resendRecipientOpenId,
    });
    const { card } = buildNotificationCard(notificationInput, documentUrl);
    const { postFeishuDirectCard } = await import("../../../integrations/feishu/bot");
    const sent = await postFeishuDirectCard(notification.providerId, resendRecipientOpenId, card);
    const sentAt = new Date();
    await db
      .update(recruitingNotificationDelivery)
      .set({
        error: null,
        feishuMessageId: sent.id ?? null,
        sentAt,
        status: "sent",
      })
      .where(eq(recruitingNotificationDelivery.id, resendNotificationId));
    return { notificationId: resendNotificationId, sentAt: sentAt.toISOString() };
  } catch (error) {
    const notificationError = error instanceof Error ? error : new Error(String(error));
    await markNotificationFailed(resendNotificationId, notificationError);
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
      conversationId: aiInterviewConversation.conversationId,
      interviewRecordId: aiInterviewConversation.recruitingRecordId,
    })
    .from(aiInterviewConversation)
    .innerJoin(
      recruitingRecordReadModel,
      eq(aiInterviewConversation.recruitingRecordId, recruitingRecordReadModel.id),
    )
    .innerJoin(
      aiInterviewRound,
      and(
        eq(aiInterviewRound.id, aiInterviewConversation.aiRoundId),
        eq(aiInterviewRound.conversationId, aiInterviewConversation.conversationId),
      ),
    )
    .innerJoin(
      account,
      and(
        eq(account.userId, recruitingRecordReadModel.createdBy),
        eq(account.providerId, GOOGLE_PROVIDER_ID),
      ),
    )
    .innerJoin(user, eq(recruitingRecordReadModel.createdBy, user.id))
    .where(
      and(
        eq(aiInterviewConversation.summaryStatus, "ready"),
        isNotNull(aiInterviewConversation.recruitingRecordId),
        isNotNull(recruitingRecordReadModel.createdBy),
        isNotNull(user.email),
        notExists(
          db
            .select({ id: recruitingNotificationDelivery.id })
            .from(recruitingNotificationDelivery)
            .where(
              and(
                eq(recruitingNotificationDelivery.recruitingRecordId, recruitingRecordReadModel.id),
                eq(
                  recruitingNotificationDelivery.conversationId,
                  aiInterviewConversation.conversationId,
                ),
                eq(recruitingNotificationDelivery.type, "summary_ready"),
                eq(
                  recruitingNotificationDelivery.recipientUserId,
                  recruitingRecordReadModel.createdBy,
                ),
                eq(recruitingNotificationDelivery.providerId, GOOGLE_PROVIDER_ID),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(aiInterviewConversation.updatedAt))
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
    ...extractNotificationCardSupplement(context),
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
      conversationId: recruitingNotificationDelivery.conversationId,
      interviewRecordId: recruitingNotificationDelivery.recruitingRecordId,
    })
    .from(recruitingNotificationDelivery)
    .where(
      and(
        eq(recruitingNotificationDelivery.type, "summary_ready"),
        inArray(recruitingNotificationDelivery.status, ["failed", "pending"]),
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
