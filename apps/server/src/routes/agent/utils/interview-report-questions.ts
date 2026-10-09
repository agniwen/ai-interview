import type { InterviewContextSnapshotPayload } from "@app/db-schema/interview-snapshots";
import type { InterviewQuestion } from "@app/db-schema/interview/types";

export function buildInterviewReportQuestionsFromContext(
  context: InterviewContextSnapshotPayload,
): InterviewQuestion[] {
  const personalizedQuestions: InterviewQuestion[] = context.personalizedQuestions.map(
    (question) => ({
      ...question,
      question: `[个性化] ${question.question}`,
    }),
  );
  const presetOrderBase =
    personalizedQuestions.length > 0
      ? Math.max(...personalizedQuestions.map((question) => question.order))
      : 0;
  let nextOrder = presetOrderBase + 1;
  const presetQuestions: InterviewQuestion[] = [];

  for (const template of context.questionTemplates
    .filter((row) => !row.disabledByUser)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)) {
    const label = template.scope === "job_description" ? "岗位题" : "全局题";
    for (const question of [...template.snapshot.questions].toSorted(
      (left, right) => left.sortOrder - right.sortOrder,
    )) {
      const content = question.content.trim();
      if (!content) {
        continue;
      }
      presetQuestions.push({
        difficulty: question.difficulty,
        evaluationFocus: question.evaluationFocus ?? null,
        followUpDirections: question.followUpDirections ?? null,
        order: nextOrder,
        question: `[${label}] ${content}`,
      });
      nextOrder += 1;
    }
  }

  return [...personalizedQuestions, ...presetQuestions];
}
