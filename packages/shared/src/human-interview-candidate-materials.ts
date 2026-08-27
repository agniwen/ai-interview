import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { QualitativeResumeEvaluationV2 } from "@arc/db-schema/qualitative-resume-evaluation";
import type { studioInterviewQuestionClientSchema } from "@arc/db-schema/studio-interviews";
import { z } from "zod";

export const humanInterviewCandidateHrEvaluationSchema = z
  .object({
    availability: z.string().nullable(),
    careerProgression: z.string().nullable(),
    compensationExpectations: z.string().nullable(),
    jobMotivation: z.string().nullable(),
    overseasTravel: z.string().nullable(),
    projectHighlights: z.string().nullable(),
    recentWork: z.string().nullable(),
  })
  .strict();

export type HumanInterviewCandidateHrEvaluation = z.infer<
  typeof humanInterviewCandidateHrEvaluationSchema
>;

export type HumanInterviewCandidateQuestion = z.infer<typeof studioInterviewQuestionClientSchema>;

export interface HumanInterviewCandidateMaterialListItem {
  candidateName: string;
  id: string;
  rounds: {
    id: string;
    label: string;
  }[];
  targetRole: string | null;
}

export interface HumanInterviewCandidateMaterialListResponse {
  candidates: HumanInterviewCandidateMaterialListItem[];
  meetingId: string;
}

export interface HumanInterviewCandidateOverviewResponse {
  candidate: {
    candidateEmail: string | null;
    candidateName: string;
    candidatePhone: string | null;
    creatorName: string | null;
    hasResumeFile: boolean;
    id: string;
    jobDescriptionName: string | null;
    resumeFileName: string | null;
    resumeProfile: ResumeProfile | null;
    targetRole: string | null;
  };
}

export interface HumanInterviewCandidateAiEvaluationResponse {
  aiEvaluation:
    | {
        evaluation: QualitativeResumeEvaluationV2;
        status: "ready";
      }
    | {
        evaluation: null;
        status: "failed" | "legacy" | "missing" | "pending";
      };
}

export interface HumanInterviewCandidateHrInformationResponse {
  hrInitialInformation: {
    conversationId: string;
    generatedAt: string;
    roundLabel: string | null;
    values: HumanInterviewCandidateHrEvaluation;
  } | null;
}

export interface HumanInterviewCandidateQuestionsResponse {
  interviewQuestions: HumanInterviewCandidateQuestion[];
}
