import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { aiInterviewConversation, humanInterviewRound } from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db";

export interface McpReportQuery {
  organizationId: string;
  candidateId: string;
  includeHuman: boolean;
}

export async function listMcpInterviewReports(
  input: McpReportQuery,
  page: number,
  pageSize: number,
) {
  const ai = db
    .select({
      createdAt: aiInterviewConversation.createdAt,
      id: sql<string>`${aiInterviewConversation.conversationId}`.as("id"),
      kind: sql<string>`'ai'`.as("kind"),
      status: sql<string>`${aiInterviewConversation.summaryStatus}`.as("status"),
    })
    .from(aiInterviewConversation)
    .where(
      and(
        eq(aiInterviewConversation.organizationId, input.organizationId),
        eq(aiInterviewConversation.recruitingRecordId, input.candidateId),
      ),
    );
  const query = input.includeHuman
    ? unionAll(
        ai,
        db
          .select({
            createdAt: humanInterviewRound.createdAt,
            id: humanInterviewRound.id,
            kind: sql<string>`'human'`.as("kind"),
            status: sql<string>`${humanInterviewRound.evaluationStatus}`.as("status"),
          })
          .from(humanInterviewRound)
          .where(
            and(
              eq(humanInterviewRound.organizationId, input.organizationId),
              eq(humanInterviewRound.recruitingRecordId, input.candidateId),
              isNotNull(humanInterviewRound.evaluationSubmittedAt),
            ),
          ),
      )
    : ai;
  const rows = await query
    .orderBy(sql`created_at desc`, sql`id desc`)
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);
  return {
    hasMore: rows.length > pageSize,
    page,
    pageSize,
    records: rows
      .slice(0, pageSize)
      .map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}

export async function getMcpInterviewReport(
  input: McpReportQuery,
  id: string,
  kind: "ai" | "human",
) {
  if (kind === "human") {
    if (!input.includeHuman) {
      return null;
    }
    const [row] = await db
      .select({
        evaluation: humanInterviewRound.evaluation,
        feedback: humanInterviewRound.feedback,
        id: humanInterviewRound.id,
        label: humanInterviewRound.label,
        outcome: humanInterviewRound.outcome,
        submittedAt: humanInterviewRound.evaluationSubmittedAt,
      })
      .from(humanInterviewRound)
      .where(
        and(
          eq(humanInterviewRound.id, id),
          eq(humanInterviewRound.organizationId, input.organizationId),
          eq(humanInterviewRound.recruitingRecordId, input.candidateId),
          isNotNull(humanInterviewRound.evaluationSubmittedAt),
        ),
      )
      .limit(1);
    return row ? { ...row, kind, submittedAt: row.submittedAt?.toISOString() ?? null } : null;
  }
  const [row] = await db
    .select({
      endedAt: aiInterviewConversation.endedAt,
      id: aiInterviewConversation.conversationId,
      keyInformation: aiInterviewConversation.keyInformation,
      startedAt: aiInterviewConversation.startedAt,
      status: aiInterviewConversation.summaryStatus,
      summary: aiInterviewConversation.transcriptSummary,
    })
    .from(aiInterviewConversation)
    .where(
      and(
        eq(aiInterviewConversation.conversationId, id),
        eq(aiInterviewConversation.organizationId, input.organizationId),
        eq(aiInterviewConversation.recruitingRecordId, input.candidateId),
      ),
    )
    .orderBy(desc(aiInterviewConversation.createdAt))
    .limit(1);
  return row ? { ...row, kind } : null;
}
