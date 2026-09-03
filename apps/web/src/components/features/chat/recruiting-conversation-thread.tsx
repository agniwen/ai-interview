import type { ReactNode } from "react";
import { RecruitingCopilotContextProvider } from "@/components/assistant-ui/recruiting-copilot-context";
import {
  RecruitingThread,
  RecruitingToolRenderers,
} from "@/components/assistant-ui/recruiting-thread";

export interface RecruitingConversationThreadProps {
  conversationId: string | null;
  historyLoading: boolean;
  historyLoadingFallback: ReactNode;
  isRunning: boolean;
}

export default function RecruitingConversationThread({
  conversationId,
  historyLoading,
  historyLoadingFallback,
  isRunning,
}: RecruitingConversationThreadProps) {
  return (
    <RecruitingCopilotContextProvider conversationId={conversationId}>
      <RecruitingToolRenderers />
      <RecruitingThread
        historyLoading={historyLoading}
        historyLoadingFallback={historyLoadingFallback}
        isRunning={isRunning}
      />
    </RecruitingCopilotContextProvider>
  );
}
