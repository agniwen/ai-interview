import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { enqueueResumeSemanticIndexJobBestEffort } from "@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/enqueue";
import { generateInterviewQuestionsForProfile } from "@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent";
import {
  enqueueResumePoolReviewGenerationBestEffort,
  enqueueResumeReviewGenerationForRecordBestEffort,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-queue";
import { reassessResumeRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-worker";
import { studioInterview } from "@arc/db-schema/schema";
import { resolveCandidateQuestionGenerationEnabled } from "@arc/shared/interview/candidate-question-generation-config";

export interface ParsedResumeEnrichmentDependencies {
  enqueueResumePoolReviewGenerationBestEffort: typeof enqueueResumePoolReviewGenerationBestEffort;
  enqueueResumeReviewGenerationForRecordBestEffort: typeof enqueueResumeReviewGenerationForRecordBestEffort;
  enqueueResumeSemanticIndexJobBestEffort: typeof enqueueResumeSemanticIndexJobBestEffort;
  generateInterviewQuestionsForProfile: typeof generateInterviewQuestionsForProfile;
  reassessResumeRecord: typeof reassessResumeRecord;
  resolveCandidateQuestionGenerationEnabled: typeof resolveCandidateQuestionGenerationEnabled;
}

export const defaultParsedResumeEnrichmentDependencies: ParsedResumeEnrichmentDependencies = {
  enqueueResumePoolReviewGenerationBestEffort,
  enqueueResumeReviewGenerationForRecordBestEffort,
  enqueueResumeSemanticIndexJobBestEffort,
  generateInterviewQuestionsForProfile,
  reassessResumeRecord,
  resolveCandidateQuestionGenerationEnabled,
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

async function requireEnrichmentTasks(tasks: Promise<boolean>[]): Promise<void> {
  const results = await Promise.all(tasks);
  if (results.some((enqueued) => !enqueued)) {
    throw new Error("简历后续分析任务入队失败。");
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
): Promise<boolean> {
  const result = await dependencies.enqueueResumeReviewGenerationForRecordBestEffort({
    ...input,
    source: "resume_upload",
  });
  if (result.status === "failed") {
    return false;
  }
  if (result.status === "fallback_sync") {
    await dependencies.reassessResumeRecord({
      organizationId: input.organizationId,
      resumeRecordId: input.resumeRecordId,
    });
  }
  return true;
}

export async function generateParsedResumeQuestionsBestEffort(
  input: {
    organizationId: string;
    resumeRecordId: string | null;
  },
  dependencies: ParsedResumeEnrichmentDependencies = defaultParsedResumeEnrichmentDependencies,
): Promise<void> {
  if (
    !input.resumeRecordId ||
    !dependencies.resolveCandidateQuestionGenerationEnabled(process.env)
  ) {
    return;
  }

  const startedAt = Date.now();
  logStep("questions.generate.start", { resumeRecordId: input.resumeRecordId });
  try {
    const [record] = await db
      .select({
        interviewQuestions: studioInterview.interviewQuestions,
        resumeProfile: studioInterview.resumeProfile,
      })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      )
      .limit(1);
    if (!record?.resumeProfile || record.interviewQuestions.length > 0) {
      return;
    }
    const interviewQuestions = await dependencies.generateInterviewQuestionsForProfile(
      record.resumeProfile,
    );
    await db
      .update(studioInterview)
      .set({ interviewQuestions, updatedAt: new Date() })
      .where(
        and(
          eq(studioInterview.id, input.resumeRecordId),
          eq(studioInterview.organizationId, input.organizationId),
        ),
      );
    logStep("questions.generate.done", {
      count: interviewQuestions.length,
      durationMs: Date.now() - startedAt,
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

async function markParsedResumeRecordReady(input: {
  organizationId: string;
  resumeRecordId: string | null;
}): Promise<void> {
  if (!input.resumeRecordId) {
    return;
  }
  const now = new Date();
  await db
    .update(studioInterview)
    .set({
      resumeParseError: null,
      resumeParseStatus: "ready",
      resumeParsedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    );
}

export async function completeParsedResumeEnrichment(
  input: ParsedResumeEnrichmentInput,
  dependencies: ParsedResumeEnrichmentDependencies = defaultParsedResumeEnrichmentDependencies,
): Promise<void> {
  await markParsedResumeRecordReady({
    organizationId: input.organizationId,
    resumeRecordId: input.succeededRecordId,
  });

  if (input.succeededRecordId) {
    await requireEnrichmentTasks([
      scheduleLibraryEvaluation(
        {
          autoMatchJobDescription: input.autoMatchJobDescription,
          generationToken: input.generationToken,
          jobDescriptionId: input.jobDescriptionId,
          organizationId: input.organizationId,
          resumeRecordId: input.succeededRecordId,
        },
        dependencies,
      ),
      dependencies.enqueueResumeSemanticIndexJobBestEffort({
        organizationId: input.organizationId,
        sourceId: input.succeededRecordId,
        sourceType: "studio_interview",
      }),
    ]);
    return;
  }
  if (!input.succeededPoolItemId) {
    return;
  }
  const tasks: Promise<boolean>[] = [
    dependencies.enqueueResumeSemanticIndexJobBestEffort({
      organizationId: input.organizationId,
      sourceId: input.succeededPoolItemId,
      sourceType: "resume_pool_item",
    }),
  ];
  if (input.autoMatchJobDescription || input.jobDescriptionId) {
    tasks.push(
      dependencies.enqueueResumePoolReviewGenerationBestEffort({
        autoMatchJobDescription: input.autoMatchJobDescription,
        generationToken: input.generationToken,
        jobDescriptionId: input.jobDescriptionId,
        organizationId: input.organizationId,
        poolItemId: input.succeededPoolItemId,
      }),
    );
  }
  await requireEnrichmentTasks(tasks);
}
