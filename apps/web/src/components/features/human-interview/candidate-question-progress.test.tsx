// @vitest-environment jsdom
import { setTimeout } from "node:timers/promises";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";
import { questionChecklistKey } from "@app/shared/human-interview-candidate-materials";
import type { HumanInterviewCandidateQuestionsResponse } from "@app/shared/human-interview-candidate-materials";
import {
  CandidateQuestionProgress,
  candidateQuestionsQueryKey,
} from "./candidate-question-progress";

const save =
  vi.fn<
    (
      inviteToken: string,
      candidateId: string,
      input: { questionKey: string; asked: boolean },
    ) => Promise<HumanInterviewCandidateQuestionsResponse>
  >();
// SAFETY: React's test-only act flag belongs to this jsdom environment.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const question = {
  difficulty: "medium" as const,
  dimension: "business" as const,
  evaluationFocus: "说明依据",
  followUpDirections: "如何验证",
  order: 1,
  question: "如何设计用户分层？",
};
const initial: HumanInterviewCandidateQuestionsResponse = {
  canEditQuestions: true,
  interviewQuestions: [question],
  questionHistory: [],
};
const queryKey = candidateQuestionsQueryKey("token", "candidate");
function Harness() {
  const { data } = useQuery({
    enabled: false,
    initialData: initial,
    queryFn: () => Promise.resolve(initial),
    queryKey,
  });
  return (
    <CandidateQuestionProgress
      data={data}
      inviteToken="token"
      candidateId="candidate"
      saveQuestion={save}
    />
  );
}
beforeEach(() => vi.resetAllMocks());
it.each([true, false])(
  "updates from the saved audit response only when save succeeds (%s)",
  async (succeeds) => {
    const edit = {
      asked: true,
      createdAt: "2026-10-08T03:00:00Z",
      id: "edit-1",
      meetingId: "meeting-2",
      meetingTitle: "业务二面",
      operatorId: "user-1",
      operatorName: "面试官甲",
      question: question.question,
      questionKey: questionChecklistKey(question),
      sequence: 1,
    };
    if (succeeds) {
      save.mockResolvedValue({ ...initial, questionHistory: [edit] });
    } else {
      save.mockRejectedValue(new Error("保存失败，请重试"));
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          <QueryClientProvider client={client}>
            <Harness />
          </QueryClientProvider>,
        ),
      );
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[role="checkbox"]')?.click();
        await setTimeout(20);
      });
      await act(async () => {
        await setTimeout(20);
      });
      expect(save).toHaveBeenCalledWith("token", "candidate", {
        asked: true,
        questionKey: edit.questionKey,
      });
      expect(container.querySelector('[role="checkbox"]')?.getAttribute("aria-checked")).toBe(
        String(succeeds),
      );
      if (succeeds) {
        expect(container.textContent).toContain("已提问");
        expect(container.textContent).toContain("面试官甲");
        expect(container.textContent).toContain("业务二面");
      } else {
        expect(client.getQueryData(queryKey)).toEqual(initial);
      }
    } finally {
      await act(() => root.unmount());
      client.clear();
      container.remove();
    }
  },
);
