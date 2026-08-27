import type { InterviewQuestion } from "@arc/db-schema/interview/types";

export function normalizeCandidateInterviewQuestions(
  questions: InterviewQuestion[],
): InterviewQuestion[] {
  return questions.map((question, index) => ({
    ...question,
    dimension: question.dimension ?? "business",
    evaluationFocus: question.evaluationFocus?.trim() || null,
    followUpDirections: question.followUpDirections?.trim() || null,
    order: index + 1,
    question: question.question.trim(),
  }));
}
