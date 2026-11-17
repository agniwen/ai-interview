import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { HumanMeetingToolPanel } from "./human-meeting-tool-panel";

export function CandidateQuestionsPanel({
  closeQuestions,
  id,
  open,
  questions,
  target,
}: {
  closeQuestions: () => void;
  id: string;
  open: boolean;
  questions: ReactNode;
  target?: HTMLElement | null;
}) {
  if (!questions || target === null) {
    return null;
  }
  if (target) {
    return createPortal(
      <div id={id} className="flex min-h-0 flex-1 flex-col">
        {questions}
      </div>,
      target,
    );
  }
  return (
    <HumanMeetingToolPanel
      closeLabel="关闭面试题"
      id={id}
      onClose={closeQuestions}
      open={open}
      slot="meeting-questions-panel"
      title="面试题"
    >
      {questions}
    </HumanMeetingToolPanel>
  );
}
