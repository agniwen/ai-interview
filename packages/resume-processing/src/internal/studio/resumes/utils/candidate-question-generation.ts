import { updateRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../lib/db";
import { generateInterviewQuestionsForProfile } from "../../../agents/resume-analysis-agent";
import { jobDescription } from "@app/db-schema/schema";
import {
  enqueueResumeReviewGenerationJobs,
  isResumeReviewGenerationQueueConfigured,
} from "@app/resume-parse-queue/resume-review-generation";
import { resolveCandidateQuestionGenerationEnabled } from "@app/shared/interview/candidate-question-generation-config";

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
      interviewQuestions: recruitingRecordReadModel.interviewQuestions,
      jobName: jobDescription.name,
      jobPrompt: jobDescription.prompt,
      resumeProfile: recruitingRecordReadModel.resumeProfile,
    })
    .from(recruitingRecordReadModel)
    .leftJoin(
      jobDescription,
      and(
        eq(recruitingRecordReadModel.jobDescriptionId, jobDescription.id),
        eq(jobDescription.organizationId, input.organizationId),
      ),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.id, input.resumeRecordId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
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
  const updated = await updateRecruitingRecords(
    db,
    and(
      eq(recruitingRecordReadModel.id, input.resumeRecordId),
      eq(recruitingRecordReadModel.organizationId, input.organizationId),
      sql`${recruitingRecordReadModel.interviewQuestions} = '[]'::jsonb`,
    ),
    { interviewQuestions, updatedAt: new Date() },
  );
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
