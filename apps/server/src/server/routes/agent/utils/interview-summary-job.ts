import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@server/lib/server/db/index";
import { captureBackendException } from "@server/lib/server/sentry";
import { interviewConversation } from "@app/db-schema/schema";
import type { InterviewQuestion } from "@app/db-schema/interview/types";
import { notifyInterviewSummaryReady } from "./feishu-interview-notifications";
import { cacheTags, safeUpdateTag } from "../../../cache-tags";
import { runInterviewReportWorkflow } from "../../../agents/mastra/workflows/interview-report-workflow";
import {
  applyInterviewReportAnswerFallback,
  formatCandidateFormSubmissions,
  interviewEvaluationSchema,
} from "./interview-report";
import { createInterviewEvidenceSnapshot } from "./evidence-snapshot";
import {
  isInterviewQuestionSetComplete,
  parseInterviewDataCollectionResults,
} from "@app/shared/interview/question-outcomes";
import { enqueueAiReportReadyEvent } from "../../../interview-notifications/utils/events";
import {
  isInterviewNotificationFlowEnabled,
  isInterviewNotificationWorkerEnabled,
} from "../../../interview-notifications/utils/feature-flags";

const LOG_PREFIX = "[interview-summary]";
const jsonObjectSchema = z.record(z.string(), z.json());

// A row stuck in `running` past this threshold is assumed orphaned (process
// crashed mid-LLM) and re-claimable.
const RUNNING_STALE_MINUTES = 10;

function buildEvaluationQuestionsFromContext(
  context: Awaited<ReturnType<typeof createInterviewEvidenceSnapshot>>["payload"]["context"],
): (InterviewQuestion & { questionId: string })[] {
  let nextOrder = 1;
  const presetQuestions: (InterviewQuestion & { questionId: string })[] = [];

  for (const template of context.questionTemplates
    .filter((row) => !row.disabledByUser)
    .toSorted((a, b) => a.sortOrder - b.sortOrder)) {
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
        question: content,
        questionId: question.id,
      });
      nextOrder += 1;
    }
  }

  return presetQuestions;
}

export interface RunSummaryJobOptions {
  conversationId: string;
  interviewRecordId: string;
  notifyOnReady?: boolean;
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
  const { conversationId, interviewRecordId, notifyOnReady = true } = options;
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
      .returning({
        dataCollectionResults: interviewConversation.dataCollectionResults,
        transcript: interviewConversation.transcript,
      });

    if (claimed.length === 0) {
      // Either the row doesn't exist, is already `ready`, or another
      // invocation is actively processing it. Either way — nothing to do.
      return;
    }

    const [{ dataCollectionResults: rawDataCollectionResults, transcript }] = claimed;

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
    const dataCollectionResults = parseInterviewDataCollectionResults(rawDataCollectionResults);
    const shouldAutomaticallyGenerateEvaluationDocument =
      isInterviewQuestionSetComplete(dataCollectionResults);

    const workflowReport = await runInterviewReportWorkflow({
      candidateFormResponses: formatCandidateFormSubmissions(evidence.payload.formSubmissions),
      dataCollectionResults,
      questions,
      transcript,
    });
    const parsedEvaluation = interviewEvaluationSchema.safeParse(workflowReport.evaluation);
    const report = applyInterviewReportAnswerFallback(
      {
        ...workflowReport,
        evaluation: parsedEvaluation.success ? parsedEvaluation.data : null,
      },
      dataCollectionResults,
    );
    const hasSummary = report.summary !== null;
    const hasEvaluation = report.evaluation !== null;

    if (!(hasSummary && hasEvaluation)) {
      const generationError =
        [report.summaryError, report.evaluationError].filter(Boolean).join(" | ") ||
        "interview report generation was incomplete";
      captureBackendException(new Error(generationError), "interview.report.partial_generation", {
        conversationId,
        hasEvaluation,
        hasSummary,
        interviewRecordId,
      });
      await db
        .update(interviewConversation)
        .set({
          evaluationCriteriaResults: report.evaluation
            ? jsonObjectSchema.parse(report.evaluation)
            : undefined,
          summaryError: generationError,
          summaryStatus: "failed",
          transcriptSummary: report.summary ?? undefined,
        })
        .where(eq(interviewConversation.conversationId, conversationId));
      return;
    }

    await db.transaction(async (tx) => {
      await tx
        .update(interviewConversation)
        .set({
          evaluationCriteriaResults: jsonObjectSchema.parse(report.evaluation),
          // Reset attempts on success so a future manual re-run has a full
          // retry budget instead of starting from the accumulated count.
          summaryAttempts: 0,
          summaryError:
            [report.summaryError, report.evaluationError].filter(Boolean).join(" | ") || null,
          summaryStatus: "ready",
          transcriptSummary: report.summary,
        })
        .where(eq(interviewConversation.conversationId, conversationId));

      if (shouldAutomaticallyGenerateEvaluationDocument && isInterviewNotificationFlowEnabled()) {
        await enqueueAiReportReadyEvent(tx, { conversationId, interviewRecordId });
      }
    });

    safeUpdateTag(cacheTags.interviewConversations);
    safeUpdateTag(cacheTags.interviewConversationsByRecord(interviewRecordId));

    if (
      notifyOnReady &&
      shouldAutomaticallyGenerateEvaluationDocument &&
      !isInterviewNotificationWorkerEnabled()
    ) {
      void notifyInterviewSummaryReady({
        conversationId,
        interviewRecordId,
      });
    }
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
