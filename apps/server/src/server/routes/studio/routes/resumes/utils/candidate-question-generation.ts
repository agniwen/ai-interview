import { and, eq, sql } from "drizzle-orm";
import { db } from "@app/server/lib/server/db";
import { generateInterviewQuestionsForProfile } from "@app/server/server/agents/resume-analysis-agent";
import { jobDescription, studioInterview } from "@arc/db-schema/schema";
import {
  enqueueResumeReviewGenerationJobs,
  isResumeReviewGenerationQueueConfigured,
} from "@arc/resume-parse-queue/resume-review-generation";
import { resolveCandidateQuestionGenerationEnabled } from "@arc/shared/interview/candidate-question-generation-config";

export interface CandidateQuestionGenerationDependencies {
  generateInterviewQuestionsForProfile: typeof generateInterviewQuestionsForProfile;
  resolveCandidateQuestionGenerationEnabled: typeof resolveCandidateQuestionGenerationEnabled;
}

export const defaultCandidateQuestionGenerationDependencies: CandidateQuestionGenerationDependencies =
  {
    generateInterviewQuestionsForProfile,
    resolveCandidateQuestionGenerationEnabled,
  };

export type CandidateQuestionGenerationResult =
  | "already_generated"
  | "disabled"
  | "generated"
  | "missing_profile";

export async function generateCandidateInterviewQuestions(
  input: {
    organizationId: string;
    resumeRecordId: string;
  },
  dependencies: CandidateQuestionGenerationDependencies = defaultCandidateQuestionGenerationDependencies,
): Promise<CandidateQuestionGenerationResult> {
  if (!dependencies.resolveCandidateQuestionGenerationEnabled(process.env)) {
    return "disabled";
  }

  const [record] = await db
    .select({
      interviewQuestions: studioInterview.interviewQuestions,
      jobName: jobDescription.name,
      jobPrompt: jobDescription.prompt,
      resumeProfile: studioInterview.resumeProfile,
    })
    .from(studioInterview)
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, input.organizationId),
      ),
    )
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!record?.resumeProfile) {
    return "missing_profile";
  }
  if (record.interviewQuestions.length > 0) {
    return "already_generated";
  }

  const interviewQuestions = await dependencies.generateInterviewQuestionsForProfile(
    record.resumeProfile,
    undefined,
    {
      job:
        record.jobName && record.jobPrompt
          ? { name: record.jobName, prompt: record.jobPrompt }
          : null,
    },
  );
  const updated = await db
    .update(studioInterview)
    .set({ interviewQuestions, updatedAt: new Date() })
    .where(
      and(
        eq(studioInterview.id, input.resumeRecordId),
        eq(studioInterview.organizationId, input.organizationId),
        sql`${studioInterview.interviewQuestions} = '[]'::jsonb`,
      ),
    )
    .returning({ id: studioInterview.id });
  return updated.length > 0 ? "generated" : "already_generated";
}

export async function enqueueCandidateQuestionGenerationForRecordBestEffort(input: {
  organizationId: string;
  resumeRecordId: string;
}): Promise<boolean> {
  if (!resolveCandidateQuestionGenerationEnabled(process.env)) {
    return true;
  }
  if (!isResumeReviewGenerationQueueConfigured()) {
    return false;
  }
  try {
    await enqueueResumeReviewGenerationJobs([
      {
        organizationId: input.organizationId,
        resumeRecordId: input.resumeRecordId,
        source: "resume_pool_import_questions",
      },
    ]);
    return true;
  } catch (error) {
    console.warn("[candidate-question-generation] enqueue failed", {
      error,
      resumeRecordId: input.resumeRecordId,
    });
    return false;
  }
}
