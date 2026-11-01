import type { HumanInterviewCandidateQuestionsResponse } from "@app/shared/human-interview-candidate-materials";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { setHumanInterviewQuestionAsked } from "@/lib/client/api/endpoints/human-interview-candidate-materials";
import { CandidateQuestionChecklist } from "./candidate-question-checklist";

export function candidateQuestionsQueryKey(inviteToken: string, candidateId: string | null) {
  return ["human-interview-candidate-materials", inviteToken, candidateId, "questions"];
}

export function CandidateQuestionProgress({
  data,
  inviteToken,
  candidateId,
  saveQuestion = setHumanInterviewQuestionAsked,
}: {
  data: HumanInterviewCandidateQuestionsResponse;
  inviteToken: string;
  candidateId: string;
  saveQuestion?: typeof setHumanInterviewQuestionAsked;
}) {
  const queryClient = useQueryClient();
  const queryKey = candidateQuestionsQueryKey(inviteToken, candidateId);
  const mutation = useMutation({
    mutationFn: (input: { questionKey: string; asked: boolean }) =>
      saveQuestion(inviteToken, candidateId, input),
    onError: (error) => {
      toast.error(error.message);
    },
    onMutate: () => queryClient.cancelQueries({ queryKey }),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
    },
    retry: false,
  });
  const latest = new Map<string, boolean>();
  for (const edit of data.questionHistory) {
    if (!latest.has(edit.questionKey)) {
      latest.set(edit.questionKey, edit.asked);
    }
  }
  const asked = new Set([...latest].filter(([, checked]) => checked).map(([key]) => key));
  return (
    <>
      <CandidateQuestionChecklist
        questions={data.interviewQuestions}
        asked={asked}
        disabled={!data.canEditQuestions || mutation.isPending}
        onCheckedChange={(questionKey, checked) => mutation.mutate({ asked: checked, questionKey })}
      />
      <details className="mx-5 mb-5 text-sm">
        <summary className="cursor-pointer rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          编辑记录（{data.questionHistory.length}）
        </summary>
        {data.questionHistory.length === 0 ? (
          <p className="mt-3 text-muted-foreground">暂无编辑记录</p>
        ) : (
          <ol className="mt-3 flex flex-col gap-4" aria-label="提问状态编辑记录">
            {data.questionHistory.map((edit) => (
              <li key={edit.id} className="flex flex-col gap-1">
                <p>
                  {edit.operatorName} · {edit.asked ? "标记已提问" : "取消已提问"}
                </p>
                <p className="break-words text-muted-foreground">{edit.question}</p>
                <p className="text-muted-foreground text-xs">
                  <time dateTime={edit.createdAt}>
                    {new Date(edit.createdAt).toLocaleString("zh-CN")}
                  </time>{" "}
                  · {edit.meetingTitle}
                </p>
              </li>
            ))}
          </ol>
        )}
      </details>
    </>
  );
}
