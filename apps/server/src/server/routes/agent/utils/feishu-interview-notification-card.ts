import { qualitativeResumeEvaluationSchema } from "@app/db-schema/qualitative-resume-evaluation";
import { studioInterviewQuestionClientSchema } from "@app/db-schema/studio-interviews";

export interface InterviewNotificationCardSupplement {
  interviewQuestions: string[];
  resumeEvaluation: string | null;
}

export function extractNotificationCardSupplement(source: {
  interviewQuestions: unknown;
  qualitativeResumeEvaluation: unknown;
  resumeEvaluationArtifactMode: unknown;
}): InterviewNotificationCardSupplement {
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
    resumeEvaluation:
      source.resumeEvaluationArtifactMode === "qualitative" && parsedEvaluation.success
        ? parsedEvaluation.data.conciseOverall
        : null,
  };
}
