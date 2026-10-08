import { questionChecklistKey } from "@app/shared/human-interview-candidate-materials";
import { useId } from "react";
import { INTERVIEW_QUESTION_DIMENSION_LABEL } from "@app/db-schema/interview/types";
import type { HumanInterviewCandidateQuestionsResponse } from "@app/shared/human-interview-candidate-materials";
import { cn } from "@app/shared/utils";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";

type Question = HumanInterviewCandidateQuestionsResponse["interviewQuestions"][number];

export function CandidateQuestionChecklist({
  questions,
  asked,
  onCheckedChange,
  disabled = false,
}: {
  disabled?: boolean;
  questions: Question[];
  asked: ReadonlySet<string>;
  onCheckedChange: (key: string, checked: boolean) => void;
}) {
  const id = useId();
  return (
    <ol aria-label="面试题清单" className="divide-y px-5 pb-4">
      {questions.map((question, index) => {
        const key = questionChecklistKey(question);
        const checked = asked.has(key);
        const checkboxId = `${id}-${index}`;
        return (
          <li className="flex flex-col gap-3 py-5" key={key}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 font-medium text-muted-foreground text-sm">
                第 {question.order} 题
              </span>
              <Badge className="text-sm" variant="outline">
                {INTERVIEW_QUESTION_DIMENSION_LABEL[question.dimension ?? "business"]}
              </Badge>
              {checked ? <Badge variant="secondary">已提问</Badge> : null}
            </div>
            <Field orientation="horizontal" className="items-start gap-3" data-disabled={disabled}>
              <Checkbox
                disabled={disabled}
                id={checkboxId}
                aria-label={`第 ${question.order} 题已提问`}
                checked={checked}
                className="mt-1"
                onCheckedChange={(value) => onCheckedChange(key, value)}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-3">
                <h3>
                  <FieldLabel
                    htmlFor={checkboxId}
                    className={cn(
                      "cursor-pointer whitespace-pre-wrap break-words font-semibold text-sm leading-6",
                      checked && "text-muted-foreground line-through",
                    )}
                  >
                    {question.question}
                  </FieldLabel>
                </h3>
                {question.evaluationFocus || question.followUpDirections ? (
                  <dl className="flex flex-col gap-3">
                    {question.evaluationFocus ? (
                      <div className="flex flex-col gap-1">
                        <dt className="font-medium text-muted-foreground text-xs">考核点</dt>
                        <dd className="whitespace-pre-wrap break-words text-foreground text-xs leading-5">
                          {question.evaluationFocus}
                        </dd>
                      </div>
                    ) : null}
                    {question.followUpDirections ? (
                      <div className="flex flex-col gap-1">
                        <dt className="font-medium text-muted-foreground text-xs">追问方向</dt>
                        <dd className="whitespace-pre-wrap break-words text-foreground text-xs leading-5">
                          {question.followUpDirections}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
              </div>
            </Field>
          </li>
        );
      })}
    </ol>
  );
}
