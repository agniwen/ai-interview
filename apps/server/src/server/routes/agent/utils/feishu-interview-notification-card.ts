import { qualitativeResumeEvaluationSchema } from "@app/db-schema/qualitative-resume-evaluation";
import { studioInterviewQuestionClientSchema } from "@app/db-schema/studio-interviews";
import { parseInterviewDataCollectionResults } from "@app/shared/interview/question-outcomes";

export interface InterviewNotificationQuestionAnswer {
  answer: string;
  question: string;
}

export interface InterviewNotificationCardSupplement {
  interviewQuestions: string[];
  questionAnswers: InterviewNotificationQuestionAnswer[];
  resumeEvaluation: string | null;
}

export function extractNotificationCardSupplement(source: {
  dataCollectionResults: unknown;
  interviewQuestions: unknown;
  qualitativeResumeEvaluation: unknown;
  resumeEvaluationArtifactMode: unknown;
}): InterviewNotificationCardSupplement {
  const dataCollectionResults = parseInterviewDataCollectionResults(source.dataCollectionResults);
  const parsedEvaluation = qualitativeResumeEvaluationSchema.safeParse(
    source.qualitativeResumeEvaluation,
  );
  const parsedQuestions = studioInterviewQuestionClientSchema
    .array()
    .safeParse(source.interviewQuestions);

  return {
    interviewQuestions: parsedQuestions.success
      ? parsedQuestions.data
          .toSorted((left, right) => left.order - right.order)
          .slice(0, 3)
          .map((question) => question.question)
      : [],
    questionAnswers:
      dataCollectionResults?.questions
        .flatMap((question) =>
          question.answerSummary
            ? [{ answer: question.answerSummary, question: question.question }]
            : [],
        )
        .slice(0, 4) ?? [],
    resumeEvaluation:
      source.resumeEvaluationArtifactMode === "qualitative" && parsedEvaluation.success
        ? parsedEvaluation.data.conciseOverall
        : null,
  };
}
