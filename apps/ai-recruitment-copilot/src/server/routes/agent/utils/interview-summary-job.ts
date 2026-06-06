import { and, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { db } from "@/lib/server/db";
import { interviewConversation, studioInterview } from "@arc/db-schema/schema";
import { notifyInterviewSummaryReady } from "@/server/routes/agent/utils/feishu-interview-notifications";
import { cacheTags, safeUpdateTag } from "@/server/cache-tags";
import { generateInterviewReport } from "@/server/routes/agent/utils/interview-report";
import { loadInterviewPresetQuestionsWithScope } from "@/server/routes/studio/routes/interview-questions/dao/bindings";

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

    const baseQuestions = interview?.questions ?? [];

    // 把候选人个性化题 + 岗位绑定 / 全局绑定的预设题合并后再交给评估模型。
    // 不调用 ensureApplicableBindings：面试已经结束，只评估当时实际绑定且
    // 未被禁用的题；新增的全局模板不应回灌进历史报告。
    // Merge candidate-personalized questions with job-bound + global preset
    // questions before handing them to the evaluator. Intentionally skip
    // ensureApplicableBindings — the interview is over, so we evaluate only
    // the bindings that were live at runtime; newly created global templates
    // must not retroactively appear in past reports.
    const presetQuestions = await loadInterviewPresetQuestionsWithScope(interviewRecordId);

    // 给每条候选人个性化题在 question 文本前加 `[个性化]` 前缀, 评估模型回写到
    // evaluationCriteriaResults.questions[].question 时, 这段前缀就成了报告里
    // 题目来源的标签 —— HR 端可以直接看出哪条评分对应哪类题.
    // Prefix each personalized question with `[个性化]`. The evaluator echoes
    // the question text back into the persisted evaluation, so the prefix
    // doubles as a source label in the HR-facing report.
    const personalizedQuestions: InterviewQuestion[] = baseQuestions.map((q) => ({
      ...q,
      question: `[个性化] ${q.question}`,
    }));

    // 预设题 order 接续在个性化题最大 order 之后, 避免和个性化题 order 冲突.
    // baseQuestions 为空时基底为 0, 预设题从 1 开始. 不去重, 同题在两侧都会
    // 被模型分别评 (与本次设计明确选择保持一致).
    // Preset orders continue past the max personalized order to avoid clashes;
    // base 0 means presets start from 1 when the candidate has no personalized
    // questions. Intentionally no dedupe: a question appearing in both lists
    // gets scored twice (matches the choice locked in during design).
    const presetOrderBase =
      personalizedQuestions.length > 0 ? Math.max(...personalizedQuestions.map((q) => q.order)) : 0;

    const taggedPresetQuestions: InterviewQuestion[] = presetQuestions.map((q, index) => ({
      difficulty: q.difficulty,
      order: presetOrderBase + index + 1,
      question: `[${q.scope === "job_description" ? "岗位题" : "全局题"}] ${q.content}`,
    }));

    const questions: InterviewQuestion[] = [...personalizedQuestions, ...taggedPresetQuestions];

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
