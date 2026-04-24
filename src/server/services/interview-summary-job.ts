import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { interviewConversation, studioInterview } from "@/lib/db/schema";
import { safeUpdateTag } from "@/server/routes/interview/utils";
import { generateInterviewReport } from "@/server/services/interview-report";

const LOG_PREFIX = "[interview-summary]";

// A row stuck in `running` past this threshold is assumed orphaned (process
// crashed mid-LLM) and re-claimable.
const RUNNING_STALE_MINUTES = 10;

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

    const [interview] = await db
      .select({ questions: studioInterview.interviewQuestions })
      .from(studioInterview)
      .where(eq(studioInterview.id, interviewRecordId))
      .limit(1);

    const questions = interview?.questions ?? [];

    const report = await generateInterviewReport({ questions, transcript });

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

    safeUpdateTag("interview-conversations");
    safeUpdateTag(`interview-conversations-${interviewRecordId}`);
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
