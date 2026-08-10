"use client";

import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { DIFFICULTY_LABEL, DIFFICULTY_PILL_CLASS } from "@arc/shared/interview-question-difficulty";
import { cn } from "@arc/shared/utils";

import { Badge } from "@/components/ui/badge";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Modal } from "@/components/ui/modal";

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
  onOpenChange,
  open,
  questions,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  questions: InterviewQuestion[];
}) {
  return (
    <Modal
      className="sm:max-h-[70vh]"
      description={`共 ${questions.length} 题，发起 AI 面试时生成`}
      onOpenChange={onOpenChange}
      open={open}
      size="3xl"
      title="推荐问题"
    >
      <Frame>
        <FrameHeader className="flex-row items-center justify-between gap-3">
          <FrameTitle>推荐问题</FrameTitle>
          <Badge variant="outline">共{questions.length}题</Badge>
        </FrameHeader>
        <FramePanel className="flex flex-col gap-0 p-0">
          {questions.map((question, index) => (
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
                <Badge className={cn(DIFFICULTY_PILL_CLASS[question.difficulty])} variant="outline">
                  {DIFFICULTY_LABEL[question.difficulty]}
                </Badge>
              </div>
              <p className="whitespace-pre-wrap font-medium text-sm leading-6">
                {question.question}
              </p>
              <div className="flex flex-col gap-2">
                <QuestionMeta label="考核点" value={question.evaluationFocus} />
                <QuestionMeta label="追问方向" value={question.followUpDirections} />
              </div>
            </div>
          ))}
        </FramePanel>
      </Frame>
    </Modal>
  );
}
