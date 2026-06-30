import { createScorer } from "@mastra/core/evals";
import { z } from "zod";
import {
  generatedInterviewQuestionSchema,
  resumeProfileSchema,
} from "@arc/db-schema/interview/types";

const resumeProfileOutputSchema = z.object({
  resumeProfile: resumeProfileSchema,
});

const interviewQuestionSchema = generatedInterviewQuestionSchema.extend({
  order: z.number().int().min(1),
});

const interviewQuestionsOutputSchema = z.object({
  interviewQuestions: z.array(interviewQuestionSchema),
});

const resumeReviewOutputSchema = z.object({
  review: z.string(),
  structuredReview: z.unknown().nullable().optional(),
});

function scoreBooleanFields(values: boolean[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.filter(Boolean).length / values.length;
}

function hasValue(value: unknown) {
  if (typeof value === "string") {
    return value.trim().length > 0 && value.trim() !== "未发现信息";
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return value !== null && value !== undefined;
}

export const resumeProfileCompletenessScorer = createScorer({
  description: "Scores whether resume parsing produced the core fields needed by the product.",
  id: "resume-profile-completeness-scorer",
  type: { input: z.unknown(), output: resumeProfileOutputSchema },
}).generateScore(({ run }) => {
  const profile = run.output.resumeProfile;
  return scoreBooleanFields([
    hasValue(profile.name),
    hasValue(profile.phone),
    hasValue(profile.email),
    hasValue(profile.targetRoles),
    hasValue(profile.skills),
    hasValue(profile.schools),
    hasValue(profile.workYears),
  ]);
});

export const interviewQuestionCountScorer = createScorer({
  description: "Scores whether interview question generation returned the expected 10 questions.",
  id: "interview-question-count-scorer",
  type: { input: z.unknown(), output: interviewQuestionsOutputSchema },
}).generateScore(({ run }) => Math.min(run.output.interviewQuestions.length / 10, 1));

export const resumeReviewStructureScorer = createScorer({
  description: "Scores whether resume review generation produced text and structured data.",
  id: "resume-review-structure-scorer",
  type: { input: z.unknown(), output: resumeReviewOutputSchema },
}).generateScore(({ run }) =>
  scoreBooleanFields([hasValue(run.output.review), hasValue(run.output.structuredReview)]),
);

export const recruitmentScorers = {
  interviewQuestionCountScorer,
  resumeProfileCompletenessScorer,
  resumeReviewStructureScorer,
};
