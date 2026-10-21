import { updateRecruitingRecords } from "@app/recruiting/records";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { and, eq } from "drizzle-orm";
import { db } from "../../../runtime/db";
import { enqueueResumeSemanticIndexJobBestEffort } from "../../../runtime/resume-semantic/enqueue";
import {
  defaultCandidateQuestionGenerationDependencies,
  generateCandidateInterviewQuestions,
} from "../../resumes/utils/candidate-question-generation";
import type { CandidateQuestionGenerationDependencies } from "../../resumes/utils/candidate-question-generation";
import {
  enqueueResumePoolReviewGenerationBestEffort,
  scheduleResumeEvaluationForRecord,
} from "../../resumes/utils/review-queue";
import { reassessResumeRecord } from "../../resumes/utils/review-worker";

async function markParsedResumeRecordReady(input: {
  organizationId: string;
  resumeRecordId: string | null;
}): Promise<void> {
  if (!input.resumeRecordId) {
    return;
  }
  const now = new Date();
  await updateRecruitingRecords(
    db,
    and(
      eq(recruitingRecordReadModel.id, input.resumeRecordId),
      eq(recruitingRecordReadModel.organizationId, input.organizationId),
    ),
    {
      resumeParseError: null,
      resumeParseStatus: "ready",
      resumeParsedAt: now,
      updatedAt: now,
    },
  );
}

export interface ParsedResumeEnrichmentDependencies extends CandidateQuestionGenerationDependencies {
  enqueueResumePoolReviewGenerationBestEffort: typeof enqueueResumePoolReviewGenerationBestEffort;
  scheduleResumeEvaluationForRecord: typeof scheduleResumeEvaluationForRecord;
  enqueueResumeSemanticIndexJobBestEffort: typeof enqueueResumeSemanticIndexJobBestEffort;
  reassessResumeRecord: typeof reassessResumeRecord;
  markParsedResumeRecordReady: typeof markParsedResumeRecordReady;
}

export const defaultParsedResumeEnrichmentDependencies: ParsedResumeEnrichmentDependencies = {
  enqueueResumePoolReviewGenerationBestEffort,
  enqueueResumeSemanticIndexJobBestEffort,
  ...defaultCandidateQuestionGenerationDependencies,
  markParsedResumeRecordReady,
  reassessResumeRecord,
  scheduleResumeEvaluationForRecord,
};

interface ParsedResumeEnrichmentInput {
  autoMatchJobDescription: boolean;
  generationToken: string;
  jobDescriptionId: string | null;
  organizationId: string;
  succeededPoolItemId: string | null;
  succeededRecordId: string | null;
}

function logStep(
  step: string,
  data: Record<string, boolean | number | string | null | undefined>,
): void {
  console.info("[bulk-upload-worker]", { step, ...data });
}

interface EnrichmentTask {
  label: string;
  run: Promise<EnrichmentTaskResult>;
}

interface EnrichmentTaskResult {
  detail?: string;
  ok: boolean;
}

async function toTaskResult(enqueued: Promise<boolean>): Promise<EnrichmentTaskResult> {
  return { ok: await enqueued };
}

function bestEffortTask(label: string, enqueued: Promise<boolean>): EnrichmentTask {
  return { label, run: toTaskResult(enqueued) };
}

// Throws only for retryable enqueue failures, naming each failed task so the
// queue failure report carries the cause instead of a generic message.
async function requireEnrichmentTasks(tasks: EnrichmentTask[]): Promise<void> {
  const settled = await Promise.all(
    tasks.map(async (task) => ({ label: task.label, ...(await task.run) })),
  );
  const failures = settled
    .filter((task) => !task.ok)
    .map((task) => (task.detail ? `${task.label}（${task.detail}）` : task.label));
  if (failures.length > 0) {
    throw new Error(`简历后续分析任务入队失败：${failures.join("、")}。`);
  }
}

async function scheduleLibraryEvaluation(
  input: {
    autoMatchJobDescription: boolean;
    generationToken: string;
    jobDescriptionId: string | null;
    organizationId: string;
    resumeRecordId: string;
  },
  dependencies: ParsedResumeEnrichmentDependencies,
): Promise<EnrichmentTaskResult> {
  // Explicitly unbound uploads can finish without a job-specific evaluation.
  if (!input.jobDescriptionId && !input.autoMatchJobDescription) {
    return { ok: true };
  }
  const result = await dependencies.scheduleResumeEvaluationForRecord({
    ...input,
    source: "resume_upload",
  });
  if (result.status === "failed") {
    // Retrying cannot help when no published job matches or another run owns
    // the record; the resume stays visible and can be evaluated later.
    if (result.reason !== "enqueue_failed") {
      logStep("evaluation.schedule.skipped", {
        reason: result.reason,
        resumeRecordId: input.resumeRecordId,
      });
      return { ok: true };
    }
    return { detail: result.errorMessage, ok: false };
  }
  if (result.status === "fallback_sync") {
    await dependencies.reassessResumeRecord({
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    });
  }
  return { ok: true };
}

export async function generateParsedResumeQuestionsBestEffort(
  input: {
    organizationId: string;
    resumeRecordId: string | null;
  },
  dependencies: ParsedResumeEnrichmentDependencies = defaultParsedResumeEnrichmentDependencies,
): Promise<void> {
  if (!input.resumeRecordId) {
    return;
  }

  const startedAt = Date.now();
  logStep("questions.generate.start", { resumeRecordId: input.resumeRecordId });
  try {
    const result = await generateCandidateInterviewQuestions(
      {
        organizationId: input.organizationId,
        resumeRecordId: input.resumeRecordId,
      },
      dependencies,
    );
    logStep("questions.generate.done", {
      durationMs: Date.now() - startedAt,
      result,
      resumeRecordId: input.resumeRecordId,
    });
  } catch (error) {
    console.error("[bulk-upload-worker] question generation failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
      errorName: error instanceof Error ? error.name : "UnknownError",
      resumeRecordId: input.resumeRecordId,
    });
  }
}

export async function completeParsedResumeEnrichment(
  input: ParsedResumeEnrichmentInput,
  dependencies: ParsedResumeEnrichmentDependencies = defaultParsedResumeEnrichmentDependencies,
): Promise<void> {
  await dependencies.markParsedResumeRecordReady({
    organizationId: input.organizationId,
    resumeRecordId: input.succeededRecordId,
  });

  if (input.succeededRecordId) {
    await requireEnrichmentTasks([
      {
        label: "AI 评估",
        run: scheduleLibraryEvaluation(
          {
            autoMatchJobDescription: input.autoMatchJobDescription,
            generationToken: input.generationToken,
            jobDescriptionId: input.jobDescriptionId,
            organizationId: input.organizationId,
            resumeRecordId: input.succeededRecordId,
          },
          dependencies,
        ),
      },
      bestEffortTask(
        "语义索引",
        dependencies.enqueueResumeSemanticIndexJobBestEffort({
          organizationId: input.organizationId,
          sourceId: input.succeededRecordId,
          sourceType: "studio_interview",
        }),
      ),
    ]);
    return;
  }
  if (!input.succeededPoolItemId) {
    return;
  }
  const tasks: EnrichmentTask[] = [
    bestEffortTask(
      "语义索引",
      dependencies.enqueueResumeSemanticIndexJobBestEffort({
        organizationId: input.organizationId,
        sourceId: input.succeededPoolItemId,
        sourceType: "resume_pool_item",
      }),
    ),
  ];
  if (input.autoMatchJobDescription || input.jobDescriptionId) {
    tasks.push(
      bestEffortTask(
        "人才库评估",
        dependencies.enqueueResumePoolReviewGenerationBestEffort({
          autoMatchJobDescription: input.autoMatchJobDescription,
          generationToken: input.generationToken,
          jobDescriptionId: input.jobDescriptionId,
          organizationId: input.organizationId,
          poolItemId: input.succeededPoolItemId,
        }),
      ),
    );
  }
  await requireEnrichmentTasks(tasks);
}
