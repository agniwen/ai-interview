import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { interviewConversation } from "@arc/db-schema/schema";
import { notifyInterviewSummaryReady } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/feishu-interview-notifications";
import { cacheTags, safeUpdateTag } from "@arc/ai-recruitment-copilot-backend/server/cache-tags";
import { runInterviewReportWorkflow } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/workflows/interview-report-workflow";
import { formatCandidateFormSubmissions } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/interview-report";
import { createInterviewEvidenceSnapshot } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/evidence-snapshot";

const LOG_PREFIX = "[interview-summary]";

// A row stuck in `running` past this threshold is assumed orphaned (process
// crashed mid-LLM) and re-claimable.
const RUNNING_STALE_MINUTES = 10;

function buildEvaluationQuestionsFromContext(
  context: Awaited<ReturnType<typeof createInterviewEvidenceSnapshot>>["payload"]["context"],
): InterviewQuestion[] {
  const personalizedQuestions: InterviewQuestion[] = context.personalizedQuestions.map((q) => ({
    ...q,
    question: `[个性化] ${q.question}`,
  }));
  const presetOrderBase =
    personalizedQuestions.length > 0 ? Math.max(...personalizedQuestions.map((q) => q.order)) : 0;
  let nextOrder = presetOrderBase + 1;
  const presetQuestions: InterviewQuestion[] = [];

  for (const template of context.questionTemplates
    .filter((row) => !row.disabledByUser)
    .toSorted((a, b) => a.sortOrder - b.sortOrder)) {
    const label = template.scope === "job_description" ? "岗位题" : "全局题";
    for (const question of [...template.snapshot.questions].toSorted(
      (a, b) => a.sortOrder - b.sortOrder,
    )) {
      const content = question.content.trim();
      if (!content) {
        continue;
      }
      presetQuestions.push({
        difficulty: question.difficulty,
        evaluationFocus: question.evaluationFocus ?? null,
        followUpDirections: question.followUpDirections ?? null,
        order: nextOrder,
        question: `[${label}] ${content}`,
      });
      nextOrder += 1;
    }
  }

  return [...personalizedQuestions, ...presetQuestions];
}

export interface RunSummaryJobOptions {
  conversationId: string;
  interviewRecordId: string;
}

/**
 * Generate summary + evaluation for an interview conversation and persist the
 * result. Safe to call fire-and-forget (no throws leak out).
 *
 * Guarantees:
 * - Marks summaryStatus=running before the LLM call so concurrent recoveries
 *   don't double-run.
 * - Writes summaryStatus=ready on success, failed on exhausted failure.
 * - Increments summaryAttempts every run so the recovery endpoint can back off.
 */
export async function runSummaryJob(options: RunSummaryJobOptions): Promise<void> {
  const { conversationId, interviewRecordId } = options;
  const startedAt = new Date();

  try {
    // Conditional claim — only pick up the job if it's actually retryable.
    // Prevents duplicate LLM calls when /report fires a fresh job while
    // /retry-summaries concurrently picks up the same row.
    const staleRunningThreshold = new Date(Date.now() - RUNNING_STALE_MINUTES * 60 * 1000);
    const claimed = await db
      .update(interviewConversation)
      .set({
        summaryAttempts: sql`${interviewConversation.summaryAttempts} + 1`,
        summaryStartedAt: startedAt,
        summaryStatus: "running",
      })
      .where(
        and(
          eq(interviewConversation.conversationId, conversationId),
          or(
            inArray(interviewConversation.summaryStatus, ["pending", "failed"]),
            // Orphaned run (crash mid-LLM): claim it back.
            and(
              eq(interviewConversation.summaryStatus, "running"),
              lt(interviewConversation.summaryStartedAt, staleRunningThreshold),
            ),
          ),
        ),
      )
      .returning({ transcript: interviewConversation.transcript });

    if (claimed.length === 0) {
      // Either the row doesn't exist, is already `ready`, or another
      // invocation is actively processing it. Either way — nothing to do.
      return;
    }

    const [{ transcript }] = claimed;

    if (!transcript || transcript.length === 0) {
      await db
        .update(interviewConversation)
        .set({
          summaryError: "empty transcript",
          summaryStatus: "failed",
        })
        .where(eq(interviewConversation.conversationId, conversationId));
      return;
    }

    const evidence = await createInterviewEvidenceSnapshot({ conversationId, interviewRecordId });
    const questions = buildEvaluationQuestionsFromContext(evidence.payload.context);

    const report = await runInterviewReportWorkflow({
      candidateFormResponses: formatCandidateFormSubmissions(evidence.payload.formSubmissions),
      questions,
      transcript,
    });

    const hasSummary = report.summary !== null;
    const hasEvaluation = report.evaluation !== null;

    if (!(hasSummary || hasEvaluation)) {
      await db
        .update(interviewConversation)
        .set({
          summaryError:
            [report.summaryError, report.evaluationError].filter(Boolean).join(" | ") ||
            "both summary and evaluation generation failed",
          summaryStatus: "failed",
        })
        .where(eq(interviewConversation.conversationId, conversationId));
      return;
    }

    await db
      .update(interviewConversation)
      .set({
        evaluationCriteriaResults: report.evaluation
          ? (report.evaluation as unknown as Record<string, unknown>)
          : {},
        // Reset attempts on success so a future manual re-run has a full
        // retry budget instead of starting from the accumulated count.
        summaryAttempts: 0,
        summaryError:
          [report.summaryError, report.evaluationError].filter(Boolean).join(" | ") || null,
        summaryStatus: "ready",
        transcriptSummary: report.summary,
      })
      .where(eq(interviewConversation.conversationId, conversationId));

    safeUpdateTag(cacheTags.interviewConversations);
    safeUpdateTag(cacheTags.interviewConversationsByRecord(interviewRecordId));

    void notifyInterviewSummaryReady({
      conversationId,
      interviewRecordId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error(`${LOG_PREFIX} failed for ${conversationId}:`, error);

    await db
      .update(interviewConversation)
      .set({
        summaryError: message,
        summaryStatus: "failed",
      })
      .where(eq(interviewConversation.conversationId, conversationId))
      .catch((updateError) => {
        // eslint-disable-next-line no-console
        console.error(`${LOG_PREFIX} failed to mark failure state:`, updateError);
      });
  }
}
