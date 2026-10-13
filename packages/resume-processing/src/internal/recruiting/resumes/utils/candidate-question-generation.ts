import { updateRecruitingRecords } from "@app/recruiting/records";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../../../runtime/db";
import { generateInterviewQuestionsForProfile } from "../../../agents/resume-analysis-agent";
import { jobDescription } from "@app/db-schema/schema";
import {
  enqueueResumeReviewGenerationJobs,
  isResumeReviewGenerationQueueConfigured,
} from "@app/job-queues/resume-review-generation";
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

export interface CandidateQuestionSchedulingDependencies {
  enqueue: typeof enqueueResumeReviewGenerationJobs;
  generate: typeof generateCandidateInterviewQuestions;
  isQueueConfigured: typeof isResumeReviewGenerationQueueConfigured;
}

const defaultCandidateQuestionSchedulingDependencies: CandidateQuestionSchedulingDependencies = {
  enqueue: enqueueResumeReviewGenerationJobs,
  generate: generateCandidateInterviewQuestions,
  isQueueConfigured: isResumeReviewGenerationQueueConfigured,
};

/**
 * 优先交给队列补题；队列未配置或投递失败时在当前进程后台生成，
 * 避免转入的候选人永久缺少推荐面试题。返回时不等待后台生成完成。
 */
export async function scheduleCandidateQuestionGenerationForRecord(
  input: {
    organizationId: string;
    resumeRecordId: string;
  },
  dependencies: CandidateQuestionSchedulingDependencies = defaultCandidateQuestionSchedulingDependencies,
): Promise<void> {
  if (!resolveCandidateQuestionGenerationEnabled(process.env)) {
    return;
  }
  if (dependencies.isQueueConfigured()) {
    try {
      await dependencies.enqueue([
        {
          organizationId: input.organizationId,
          resumeRecordId: input.resumeRecordId,
          source: "resume_pool_import_questions",
        },
      ]);
      return;
    } catch (error) {
      console.warn("[candidate-question-generation] enqueue failed", {
        error,
        resumeRecordId: input.resumeRecordId,
      });
    }
  }
  void (async () => {
    try {
      await dependencies.generate(input);
    } catch (error) {
      console.error("[candidate-question-generation] in-process generation failed", {
        error,
        resumeRecordId: input.resumeRecordId,
      });
    }
  })();
}
