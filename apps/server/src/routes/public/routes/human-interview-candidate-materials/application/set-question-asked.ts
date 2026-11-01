import {
  canEditHumanInterviewQuestions,
  questionChecklistKey,
} from "@app/shared/human-interview-candidate-materials";
import type { HumanInterviewCandidateQuestionsResponse } from "@app/shared/human-interview-candidate-materials";
import { db } from "../../../../../infrastructure/db/index";
import { loadHumanInterviewCandidateQuestions } from "../dao";
import type { HumanInterviewCandidateMaterialsScope } from "../dao";
import { appendQuestionEdit, lockQuestionCandidate } from "../question-progress-dao";

type Result =
  | { status: "saved"; data: HumanInterviewCandidateQuestionsResponse }
  | { status: "not_found" }
  | { status: "unavailable" };

export async function setHumanInterviewQuestionAsked(input: {
  candidateId: string;
  scope: HumanInterviewCandidateMaterialsScope;
  questionKey: string;
  asked: boolean;
}): Promise<Result> {
  if (!canEditHumanInterviewQuestions(input.scope)) {
    return { status: "unavailable" };
  }
  return await db.transaction(async (tx) => {
    if (!(await lockQuestionCandidate(tx, input.candidateId, input.scope.organizationId))) {
      return { status: "not_found" };
    }
    const data = await loadHumanInterviewCandidateQuestions(input, tx);
    const question = data?.interviewQuestions.find(
      (item) => questionChecklistKey(item) === input.questionKey,
    );
    if (!data || !question) {
      return { status: "not_found" };
    }
    const latest = data.questionHistory.find((edit) => edit.questionKey === input.questionKey);
    if ((latest?.asked ?? false) === input.asked) {
      return { data, status: "saved" };
    }
    const edit = {
      asked: input.asked,
      createdAt: new Date().toISOString(),
      id: crypto.randomUUID(),
      meetingId: input.scope.meetingId,
      meetingTitle: input.scope.title,
      operatorId: input.scope.userId,
      operatorName: input.scope.interviewerName,
      question: question.question,
      questionKey: input.questionKey,
      sequence: (data.questionHistory[0]?.sequence ?? 0) + 1,
    };
    await appendQuestionEdit(tx, { ...input, edit });
    return { data: { ...data, questionHistory: [edit, ...data.questionHistory] }, status: "saved" };
  });
}
