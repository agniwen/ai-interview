import { and, desc, eq, inArray, isNotNull, isNull, notExists, or } from "drizzle-orm";
import {
  account,
  interviewConversation,
  interviewNotification,
  organization,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  buildSenderFromAddress,
  getResendClient,
} from "@arc/ai-recruitment-copilot-backend/lib/server/resend";
import { getRequiredEnv } from "@arc/ai-recruitment-copilot-backend/lib/server/env";
import { InterviewSummaryCard } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/interview-summary-card";
import { FEISHU_PROVIDER_IDS } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
import type { FeishuProviderId } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
import { getGlobalConfig } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/global-config/dao";
import { renderInterviewSummaryEmail } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/routes/round-emails/utils/templates";

const LOG_PREFIX = "[feishu-interview-notification]";
const RETRY_BATCH_SIZE = 20;
const GOOGLE_PROVIDER_ID = "google";

interface SummaryReadyNotificationOptions {
  conversationId: string;
  interviewRecordId: string;
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
  conversationId: string;
  interviewRecordId: string;
}

function isFeishuProviderId(value: string): value is FeishuProviderId {
  return (FEISHU_PROVIDER_IDS as readonly string[]).includes(value);
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
  evaluation: Record<string, unknown>;
  organizationSlug: string | null;
  roundId: string;
  summary: string | null;
  targetRole: string | null;
}

function buildSummaryPayload(input: NotificationCardInput) {
  const overallScore =
    typeof input.evaluation.overallScore === "number"
      ? `${input.evaluation.overallScore}/100`
      : "暂无评分";
  const recommendation =
    typeof input.evaluation.recommendation === "string"
      ? input.evaluation.recommendation
      : "暂无建议";
  const assessment =
    typeof input.evaluation.overallAssessment === "string"
      ? input.evaluation.overallAssessment
      : null;

  return { assessment, overallScore, recommendation };
}

function buildNotificationCard(input: NotificationCardInput) {
  const { assessment, overallScore, recommendation } = buildSummaryPayload(input);

  const card = InterviewSummaryCard({
    assessment,
    candidateName: input.candidateName,
    detailUrl: buildStudioUrl(input.roundId, input.organizationSlug),
    overallScore,
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
      evaluationCriteriaResults: interviewConversation.evaluationCriteriaResults,
      organizationId: studioInterview.organizationId,
      organizationSlug: organization.slug,
      scheduleEntryId: interviewConversation.scheduleEntryId,
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

async function markNotificationFailed(notificationId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
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
    await markNotificationFailed(notificationId, error);
    // eslint-disable-next-line no-console
    console.error(`${LOG_PREFIX} email failed for ${input.roundId}:`, error);
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
    evaluation: context.evaluationCriteriaResults ?? {},
    organizationSlug: context.organizationSlug ?? null,
    roundId: context.scheduleEntryId,
    summary: context.transcriptSummary,
    targetRole: context.targetRole,
  };
  const detailUrl = buildStudioUrl(context.scheduleEntryId, context.organizationSlug ?? null);
  const { card } = buildNotificationCard(notificationInput);

  if (recipients.length > 0) {
    const { postFeishuDirectCard } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/bot");

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
        const sent = await postFeishuDirectCard(recipient.providerId, recipient.accountId, card);
        await markNotificationSent(notificationId, sent.id ?? null);
      } catch (error) {
        await markNotificationFailed(notificationId, error);
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
  const missingGoogleEmailRows = await loadMissingGoogleEmailNotificationTargets(RETRY_BATCH_SIZE);

  let retried = 0;
  const seen = new Set<string>();
  for (const row of [...failedRows, ...missingGoogleEmailRows]) {
    if (!row.conversationId) {
      continue;
    }
    const key = `${row.interviewRecordId}:${row.conversationId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    await notifyInterviewSummaryReady({
      conversationId: row.conversationId,
      interviewRecordId: row.interviewRecordId,
    });
    retried += 1;
  }

  return { retried };
}
