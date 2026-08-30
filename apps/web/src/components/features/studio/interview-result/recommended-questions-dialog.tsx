"use client";

import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { INTERVIEW_QUESTION_DIMENSION_LABEL } from "@arc/db-schema/interview/types";
import { DIFFICULTY_LABEL, DIFFICULTY_PILL_CLASS } from "@arc/shared/interview-question-difficulty";
import { cn } from "@arc/shared/utils";
import { IconEdit, IconLoader2 } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";
import { useEffect, useState } from "react";

import { SortableQuestionListEditor } from "@/components/features/studio/sortable-question-list-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Modal } from "@/components/ui/modal";
import { normalizeCandidateInterviewQuestions } from "../candidate-interview-questions";

function QuestionMeta({ label, value }: { label: string; value: string | null | undefined }) {
  const text = value?.trim();
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-muted-foreground/80">{label}</span>
      <p className="whitespace-pre-wrap text-muted-foreground text-xs leading-5">
        {text || "未填写"}
      </p>
    </div>
  );
}

export function RecommendedQuestionsDialog({
  canEdit = false,
  onOpenChange,
  onSave,
  open,
  questions,
}: {
  canEdit?: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (questions: InterviewQuestion[]) => boolean | Promise<boolean>;
  open: boolean;
  questions: InterviewQuestion[];
}) {
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const normalizedQuestions = normalizeCandidateInterviewQuestions(questions);
  const form = useForm({
    defaultValues: { interviewQuestions: normalizedQuestions },
    onSubmit: async ({ value }) => {
      if (!(canEdit && onSave)) {
        return;
      }
      setIsSaving(true);
      try {
        const saved = await onSave(normalizeCandidateInterviewQuestions(value.interviewQuestions));
        if (saved) {
          onOpenChange(false);
        }
      } finally {
        setIsSaving(false);
      }
    },
  });

  useEffect(() => {
    if (open) {
      setIsEditing(false);
      form.reset({ interviewQuestions: normalizeCandidateInterviewQuestions(questions) });
    }
    // The form object is stable; reset only when the dialog receives fresh source data.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [open, questions]);

  return (
    <Modal
      className="sm:max-h-[85vh]"
      description={
        isEditing
          ? `共 ${questions.length} 题，可调整内容、维度、难度和顺序`
          : `共 ${questions.length} 题，发起 AI 面试时生成`
      }
      dismissible={!isSaving}
      footer={
        isEditing ? (
          <div className="flex justify-end gap-2">
            <Button
              disabled={isSaving}
              onClick={() => {
                form.reset({
                  interviewQuestions: normalizeCandidateInterviewQuestions(questions),
                });
                setIsEditing(false);
              }}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button disabled={isSaving} onClick={() => form.handleSubmit()} type="button">
              {isSaving ? <IconLoader2 className="animate-spin" data-icon="inline-start" /> : null}
              保存问题
            </Button>
          </div>
        ) : null
      }
      onOpenChange={(next) => {
        if (!next && isSaving) {
          return;
        }
        onOpenChange(next);
      }}
      open={open}
      showCloseButton={!isSaving}
      size="3xl"
      title={isEditing ? "编辑推荐问题" : "推荐问题"}
    >
      <Frame>
        <FrameHeader className="h-auto flex-row items-center justify-between gap-3 py-2">
          <FrameTitle>推荐问题</FrameTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">共{questions.length}题</Badge>
            {canEdit && !isEditing ? (
              <Button onClick={() => setIsEditing(true)} size="sm" type="button" variant="outline">
                <IconEdit data-icon="inline-start" />
                编辑
              </Button>
            ) : null}
          </div>
        </FrameHeader>
        <FramePanel className={cn(isEditing ? "p-3" : "flex flex-col gap-0 p-0")}>
          {isEditing ? (
            <SortableQuestionListEditor
              arrayFieldName="interviewQuestions"
              contentFieldName="question"
              contentPlaceholder="输入面试题目"
              createItem={(sortIndex) => ({
                difficulty: "medium",
                dimension: "business",
                evaluationFocus: "",
                followUpDirections: "",
                order: sortIndex + 1,
                question: "",
              })}
              dimensionFieldName="dimension"
              disabled={isSaving}
              emptyDescription="可以手动添加推荐问题。"
              emptyTitle="暂无推荐问题"
              form={form}
              resetKey={open ? "recommended-questions-open" : "recommended-questions-closed"}
            />
          ) : (
            normalizedQuestions.map((question, index) => (
              <div
                className={
                  index === 0
                    ? "flex flex-col gap-2.5 px-4 py-4"
                    : "flex flex-col gap-2.5 border-border/50 border-t px-4 py-4"
                }
                key={question.order}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-muted-foreground text-xs">
                    第 {question.order} 题
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline">
                      {INTERVIEW_QUESTION_DIMENSION_LABEL[question.dimension ?? "business"]}
                    </Badge>
                    <Badge
                      className={cn(DIFFICULTY_PILL_CLASS[question.difficulty])}
                      variant="outline"
                    >
                      {DIFFICULTY_LABEL[question.difficulty]}
                    </Badge>
                  </div>
                </div>
                <p className="whitespace-pre-wrap font-medium text-sm leading-6">
                  {question.question}
                </p>
                <div className="flex flex-col gap-2">
                  <QuestionMeta label="考核点" value={question.evaluationFocus} />
                  <QuestionMeta label="追问方向" value={question.followUpDirections} />
                </div>
              </div>
            ))
          )}
        </FramePanel>
      </Frame>
    </Modal>
  );
}
