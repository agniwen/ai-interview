"use client";

import { SortableQuestionListEditor } from "../../_components/sortable-question-list-editor";
import type { InterviewFormApi } from "./interview-form";

export function InterviewQuestionsFields({
  form,
  disabled,
  resetKey,
}: {
  form: InterviewFormApi;
  disabled?: boolean;
  /**
   * Optional — pass a value that changes whenever the parent resets the form
   * (e.g. `record?.id ?? "new"`) so parallel drag ids regenerate fresh on
   * record switch. If omitted, ids stick for the component's lifetime.
   */
  resetKey?: string;
}) {
  return (
    <SortableQuestionListEditor
      arrayFieldName="interviewQuestions"
      contentFieldName="question"
      contentPlaceholder="输入面试题目"
      createItem={(sortIndex) => ({
        difficulty: "easy",
        order: sortIndex + 1,
        question: "",
      })}
      disabled={disabled}
      emptyDescription="上传简历后会自动生成面试题，也可以手动添加。"
      emptyTitle="暂无面试题"
      form={form}
      resetKey={resetKey ?? "default"}
    />
  );
}
