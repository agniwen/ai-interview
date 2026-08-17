// 邮件日志 DAO：插入发送记录 + 按轮次聚合摘要。
// Round-email log DAO: insert send record + aggregate summary per round.

import { and, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type { RoundEmailLogStatus, RoundEmailSummaryMap } from "@arc/db-schema/round-email-log";
import { studioRoundEmailLog } from "@arc/db-schema/schema";

interface InsertRoundEmailLogInput {
  errorMessage: string | null;
  interviewRecordId: string;
  organizationId: string;
  resendMessageId: string | null;
  roundId: string;
  sentBy: string | null;
  status: RoundEmailLogStatus;
  subject: string;
  templateKey?: string;
  toEmail: string;
}

export interface RoundEmailLogRecord {
  createdAt: string;
  errorMessage: string | null;
  id: string;
  interviewRecordId: string;
  organizationId: string;
  resendMessageId: string | null;
  roundId: string;
  sentBy: string | null;
  status: RoundEmailLogStatus;
  subject: string;
  templateKey: string;
  toEmail: string;
}

export async function insertRoundEmailLog(
  input: InsertRoundEmailLogInput,
): Promise<RoundEmailLogRecord> {
  const id = nanoid();
  const [row] = await db
    .insert(studioRoundEmailLog)
    .values({
      errorMessage: input.errorMessage,
      id,
      interviewRecordId: input.interviewRecordId,
      organizationId: input.organizationId,
      resendMessageId: input.resendMessageId,
      roundId: input.roundId,
      sentBy: input.sentBy,
      status: input.status,
      subject: input.subject,
      templateKey: input.templateKey ?? "round_invite",
      toEmail: input.toEmail,
    })
    .returning();
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function summarizeRoundEmailLogs(
  organizationId: string,
  roundIds: string[],
): Promise<RoundEmailSummaryMap> {
  // 为每个 roundId 初始化空摘要。
  // Initialize empty summary for each roundId.
  const result: RoundEmailSummaryMap = Object.fromEntries(
    roundIds.map((id) => [id, { count: 0, lastSentAt: null, lastStatus: null }]),
  );
  if (roundIds.length === 0) {
    return result;
  }

  const rows = await db
    .select({
      createdAt: studioRoundEmailLog.createdAt,
      roundId: studioRoundEmailLog.roundId,
      status: studioRoundEmailLog.status,
    })
    .from(studioRoundEmailLog)
    .where(
      and(
        eq(studioRoundEmailLog.organizationId, organizationId),
        inArray(studioRoundEmailLog.roundId, roundIds),
      ),
    )
    .orderBy(desc(studioRoundEmailLog.createdAt));

  // 按 createdAt DESC 排序后，第一行即为该轮次最新记录。
  // With ORDER BY createdAt DESC, the first row per round is the latest.
  for (const row of rows) {
    const summary = result[row.roundId];
    if (!summary) {
      continue;
    }
    summary.count += 1;
    if (summary.lastSentAt === null) {
      summary.lastSentAt = row.createdAt.toISOString();
      summary.lastStatus = row.status;
    }
  }
  return result;
}
