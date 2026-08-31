import { z } from "zod";

export const interviewQuestionOutcomeStatusSchema = z.enum([
  "answered",
  "insufficient",
  "skipped",
  "interrupted",
  "unasked",
]);

export const interviewQuestionOutcomeReasonSchema = z.enum([
  "time_limit",
  "candidate_ended_round",
  "question_prompt_interrupted",
  "reconnect_grace_expired",
  "system_shutdown",
]);

export const interviewQuestionOutcomeSchema = z
  .object({
    answerSummary: z.string().trim().min(1).nullable(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    endedAtSecs: z.number().min(0),
    evaluationFocus: z.string().trim().min(1).nullable(),
    followUpCount: z.number().int().min(0),
    followUpDirections: z.string().trim().min(1).nullable(),
    question: z.string().trim().min(1),
    questionId: z.string().trim().min(1),
    reason: interviewQuestionOutcomeReasonSchema.nullable(),
    revision: z.number().int().min(1),
    startedAtSecs: z.number().min(0),
    status: interviewQuestionOutcomeStatusSchema,
  })
  .strict()
  .superRefine((outcome, context) => {
    const requiresReason = outcome.status === "interrupted" || outcome.status === "unasked";
    if (requiresReason && outcome.reason === null) {
      context.addIssue({
        code: "custom",
        message: `${outcome.status} requires a reason`,
        path: ["reason"],
      });
    }
    if (!requiresReason && outcome.reason !== null) {
      context.addIssue({
        code: "custom",
        message: `${outcome.status} must not have a reason`,
        path: ["reason"],
      });
    }
  });

export type InterviewQuestionOutcome = z.infer<typeof interviewQuestionOutcomeSchema>;

export const interviewDataCollectionResultsSchema = z
  .object({
    questions: z.array(interviewQuestionOutcomeSchema),
    schemaVersion: z.literal(2),
  })
  .strict();

export type InterviewDataCollectionResults = z.infer<typeof interviewDataCollectionResultsSchema>;

export function parseInterviewDataCollectionResults<const T>(
  value: T,
): InterviewDataCollectionResults | null {
  const parsed = interviewDataCollectionResultsSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

const COMPLETED_QUESTION_OUTCOME_STATUSES = new Set<InterviewQuestionOutcome["status"]>([
  "answered",
  "insufficient",
  "skipped",
]);

/**
 * A question set is complete once every recorded question reached a terminal
 * outcome. Interrupted and unasked questions mean the interview ended before
 * the configured question flow was finished.
 */
export function isInterviewQuestionSetComplete(
  value: InterviewDataCollectionResults | null | unknown,
): boolean {
  const results = parseInterviewDataCollectionResults(value);
  return Boolean(
    results &&
    results.questions.length > 0 &&
    results.questions.every((question) => COMPLETED_QUESTION_OUTCOME_STATUSES.has(question.status)),
  );
}

/** Whether the interview reached at least one candidate-answer outcome. */
export function hasExistingInterviewAnswers(
  value: InterviewDataCollectionResults | null | unknown,
): boolean {
  const results = parseInterviewDataCollectionResults(value);
  return Boolean(
    results?.questions.some(
      (question) => question.status === "answered" || question.status === "insufficient",
    ),
  );
}

export function mergeInterviewQuestionOutcome(
  current: InterviewDataCollectionResults,
  incoming: InterviewQuestionOutcome,
): InterviewDataCollectionResults {
  const questions = [...current.questions];
  const index = questions.findIndex((question) => question.questionId === incoming.questionId);
  if (index === -1) {
    questions.push(incoming);
  } else if ((questions[index]?.revision ?? 0) < incoming.revision) {
    questions[index] = incoming;
  }
  return { questions, schemaVersion: 2 };
}
