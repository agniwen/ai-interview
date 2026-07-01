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

const interviewTranscriptTurnSchema = z
  .object({
    message: z.string(),
    role: z.enum(["agent", "user"]),
  })
  .passthrough();

const reportEvidenceGroundingInputSchema = z.object({
  transcript: z.array(interviewTranscriptTurnSchema),
});

const reportEvidenceGroundingOutputSchema = z
  .object({
    evaluation: z
      .object({
        questions: z.array(
          z
            .object({
              evidence: z.array(z.object({ quote: z.string() })).default([]),
            })
            .passthrough(),
        ),
      })
      .passthrough()
      .nullable(),
    summary: z.string().nullable().optional(),
  })
  .passthrough();

const jobDescriptionSummarySchema = z
  .object({
    departmentName: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    id: z.string(),
    name: z.string(),
  })
  .passthrough();

const jdMatchEvidenceInputSchema = z.object({
  jobDescriptions: z.array(jobDescriptionSummarySchema),
  resumeProfile: resumeProfileSchema,
});

const jdMatchEvidenceOutputSchema = z
  .object({
    jobDescriptionId: z.string().nullable().optional(),
    reason: z.string().nullable().optional(),
  })
  .passthrough();

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

function normalizeGroundingText(value: string) {
  return value.toLowerCase().replaceAll(/[\p{P}\p{S}\s]+/gu, "");
}

function normalizedTextIncludesTerm(text: string, term: unknown) {
  if (typeof term !== "string") {
    return false;
  }
  const normalizedTerm = normalizeGroundingText(term);
  return normalizedTerm.length >= 2 && text.includes(normalizedTerm);
}

function scoreReportEvidenceGrounding(input: {
  transcript: { message: string; role: "agent" | "user" }[];
  output: z.infer<typeof reportEvidenceGroundingOutputSchema>;
}) {
  const evidenceQuotes =
    input.output.evaluation?.questions
      .flatMap((question) => question.evidence.map((evidence) => evidence.quote))
      .map(normalizeGroundingText)
      .filter((quote) => quote.length > 0) ?? [];
  if (evidenceQuotes.length === 0) {
    return 0;
  }
  const candidateTranscript = normalizeGroundingText(
    input.transcript
      .filter((turn) => turn.role === "user")
      .map((turn) => turn.message)
      .join("\n"),
  );
  if (!candidateTranscript) {
    return 0;
  }
  const groundedCount = evidenceQuotes.filter((quote) =>
    candidateTranscript.includes(quote),
  ).length;
  return groundedCount / evidenceQuotes.length;
}

function scoreJdMatchEvidence(input: {
  input: z.infer<typeof jdMatchEvidenceInputSchema>;
  output: z.infer<typeof jdMatchEvidenceOutputSchema>;
}) {
  const jobDescriptionId = input.output.jobDescriptionId?.trim();
  if (!jobDescriptionId) {
    return 0;
  }
  const selectedJobDescription = input.input.jobDescriptions.find(
    (jobDescription) => jobDescription.id === jobDescriptionId,
  );
  if (!selectedJobDescription) {
    return 0;
  }

  const reason = input.output.reason ?? "";
  const normalizedReason = normalizeGroundingText(reason);
  const resumeTerms = [
    ...input.input.resumeProfile.targetRoles,
    ...input.input.resumeProfile.skills,
  ];
  const selectedJobTerms = [selectedJobDescription.name, selectedJobDescription.departmentName];

  return scoreBooleanFields([
    true,
    hasValue(reason),
    resumeTerms.some((term) => normalizedTextIncludesTerm(normalizedReason, term)),
    selectedJobTerms.some((term) => normalizedTextIncludesTerm(normalizedReason, term)),
  ]);
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

export const reportEvidenceGroundingScorer = createScorer({
  description:
    "Scores whether interview report evidence quotes are grounded in candidate transcript turns.",
  id: "report-evidence-grounding-scorer",
  type: { input: reportEvidenceGroundingInputSchema, output: reportEvidenceGroundingOutputSchema },
}).generateScore(({ run }) =>
  scoreReportEvidenceGrounding({ output: run.output, transcript: run.input?.transcript ?? [] }),
);

export const jdMatchEvidenceScorer = createScorer({
  description:
    "Scores whether the selected job description exists and the match reason cites resume/job evidence.",
  id: "jd-match-evidence-scorer",
  type: { input: jdMatchEvidenceInputSchema, output: jdMatchEvidenceOutputSchema },
}).generateScore(({ run }) => {
  if (!run.input) {
    return 0;
  }
  return scoreJdMatchEvidence({ input: run.input, output: run.output });
});

export const recruitmentScorers = {
  interviewQuestionCountScorer,
  jdMatchEvidenceScorer,
  reportEvidenceGroundingScorer,
  resumeProfileCompletenessScorer,
  resumeReviewStructureScorer,
};
