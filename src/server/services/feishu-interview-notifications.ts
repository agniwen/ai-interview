import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import {
  account,
  interviewConversation,
  interviewNotification,
  studioInterview,
} from "@/lib/db/schema";
import { db } from "@/lib/db";
import { FEISHU_PROVIDER_IDS, postFeishuDirectMessage } from "@/server/feishu/bot";
import type { FeishuProviderId } from "@/server/feishu/bot";

const LOG_PREFIX = "[feishu-interview-notification]";
const SUMMARY_PREVIEW_MAX_LENGTH = 500;
const RETRY_BATCH_SIZE = 20;

interface SummaryReadyNotificationOptions {
  conversationId: string;
  interviewRecordId: string;
}

interface RecipientAccount {
  accountId: string;
  providerId: FeishuProviderId;
  userId: string;
}

function isFeishuProviderId(value: string): value is FeishuProviderId {
  return (FEISHU_PROVIDER_IDS as readonly string[]).includes(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function buildStudioUrl(interviewRecordId: string): string {
  const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
  return `${baseUrl.replace(/\/$/, "")}/studio/interviews?recordId=${encodeURIComponent(
    interviewRecordId,
  )}`;
}

function buildNotificationText({
  candidateName,
  evaluation,
  interviewRecordId,
  summary,
  targetRole,
}: {
  candidateName: string;
  evaluation: Record<string, unknown>;
  interviewRecordId: string;
  summary: string | null;
  targetRole: string | null;
}): string {
  const overallScore =
    typeof evaluation.overallScore === "number" ? `${evaluation.overallScore}/100` : "暂无评分";
  const recommendation =
    typeof evaluation.recommendation === "string" ? evaluation.recommendation : "暂无建议";
  const assessment =
    typeof evaluation.overallAssessment === "string" ? evaluation.overallAssessment : null;

  return [
    "AI 面试报告已生成",
    "",
    `候选人：${candidateName}`,
    `目标岗位：${targetRole ?? "未填写"}`,
    `综合评分：${overallScore}`,
    `推荐结论：${recommendation}`,
    assessment ? `整体评价：${assessment}` : null,
    summary ? `面试摘要：${truncate(summary, SUMMARY_PREVIEW_MAX_LENGTH)}` : null,
    "",
    `查看详情：${buildStudioUrl(interviewRecordId)}`,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

async function loadNotificationContext(options: SummaryReadyNotificationOptions) {
  const [row] = await db
    .select({
      candidateName: studioInterview.candidateName,
      createdBy: studioInterview.createdBy,
      evaluationCriteriaResults: interviewConversation.evaluationCriteriaResults,
      summaryStatus: interviewConversation.summaryStatus,
      targetRole: studioInterview.targetRole,
      transcriptSummary: interviewConversation.transcriptSummary,
    })
    .from(interviewConversation)
    .innerJoin(studioInterview, eq(interviewConversation.interviewRecordId, studioInterview.id))
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

async function claimNotification({
  conversationId,
  interviewRecordId,
  recipient,
}: {
  conversationId: string;
  interviewRecordId: string;
  recipient: RecipientAccount;
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

export async function notifyInterviewSummaryReady(
  options: SummaryReadyNotificationOptions,
): Promise<void> {
  const context = await loadNotificationContext(options);
  if (!context || context.summaryStatus !== "ready" || !context.createdBy) {
    return;
  }

  const recipients = await loadRecipientAccounts(context.createdBy);
  if (recipients.length === 0) {
    return;
  }

  const text = buildNotificationText({
    candidateName: context.candidateName,
    evaluation: context.evaluationCriteriaResults ?? {},
    interviewRecordId: options.interviewRecordId,
    summary: context.transcriptSummary,
    targetRole: context.targetRole,
  });

  for (const recipient of recipients) {
    const notificationId = await claimNotification({
      conversationId: options.conversationId,
      interviewRecordId: options.interviewRecordId,
      recipient,
    });
    if (!notificationId) {
      continue;
    }

    try {
      const sent = await postFeishuDirectMessage(recipient.providerId, recipient.accountId, text);
      await markNotificationSent(notificationId, sent.id ?? null);
    } catch (error) {
      await markNotificationFailed(notificationId, error);
      // eslint-disable-next-line no-console
      console.error(`${LOG_PREFIX} failed for ${options.conversationId}:`, error);
    }
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

  let retried = 0;
  const seen = new Set<string>();
  for (const row of failedRows) {
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
