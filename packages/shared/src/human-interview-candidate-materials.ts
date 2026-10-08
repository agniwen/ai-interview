import type { ResumeProfile } from "@app/db-schema/interview/types";
import type { QualitativeResumeEvaluationV2 } from "@app/db-schema/qualitative-resume-evaluation";
import type {
  studioInterviewQuestionClientSchema,
  HumanInterviewEvaluationDraft,
  HumanInterviewRoundOutcome,
} from "@app/db-schema/studio-interviews";
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
  generatedAt: string | null;
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
  previousEvaluations: {
    roundId: string;
    roundLabel: string;
    outcome: HumanInterviewRoundOutcome | null;
    submittedAt: string | null;
    submittedBy: string | null;
    submittedByImage: string | null;
    values: Pick<
      HumanInterviewEvaluationDraft,
      | "rating"
      | "overallEvaluation"
      | "seniorityPosition"
      | "rolePosition"
      | "professionalSkill"
      | "strengths"
      | "risks"
      | "salaryRecommendation"
    >;
  }[];
}

export interface HumanInterviewCandidateQuestionsResponse {
  interviewQuestions: HumanInterviewCandidateQuestion[];
  questionHistory: HumanInterviewQuestionEdit[];
  canEditQuestions: boolean;
}

export function questionChecklistKey(question: HumanInterviewCandidateQuestion): string {
  return JSON.stringify([question.dimension ?? "business", question.question.trim()]);
}

export const humanInterviewQuestionEditSchema = z.object({
  asked: z.boolean(),
  meetingId: z.string(),
  meetingTitle: z.string(),
  operatorName: z.string(),
  question: z.string(),
  questionKey: z.string(),
  sequence: z.number().int().positive(),
});

export type HumanInterviewQuestionEdit = z.infer<typeof humanInterviewQuestionEditSchema> & {
  id: string;
  operatorId: string | null;
  createdAt: string;
};

export const setHumanInterviewQuestionAskedSchema = z
  .object({
    asked: z.boolean(),
    questionKey: z.string().min(1).max(20_000),
  })
  .strict();

export function canEditHumanInterviewQuestions(
  scope: { status: string; validUntil: string | null },
  now = Date.now(),
): boolean {
  return (
    (scope.status === "scheduled" || scope.status === "in_progress") &&
    scope.validUntil !== null &&
    Date.parse(scope.validUntil) >= now
  );
}
