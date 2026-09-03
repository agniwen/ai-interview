import { lazy, Suspense } from "react";
import type RecruitingConversationThreadComponent from "./recruiting-conversation-thread";
import type { RecruitingConversationThreadProps } from "./recruiting-conversation-thread";
import { ChatConversationThreadSkeleton } from "./chat-page-skeleton";

interface RecruitingConversationThreadModule {
  default: typeof RecruitingConversationThreadComponent;
}

let conversationThreadModulePromise: Promise<RecruitingConversationThreadModule> | null = null;

async function importRecruitingConversationThread() {
  try {
    return await import("./recruiting-conversation-thread");
  } catch (error) {
    conversationThreadModulePromise = null;
    throw error;
  }
}

function loadRecruitingConversationThread() {
  if (!conversationThreadModulePromise) {
    conversationThreadModulePromise = importRecruitingConversationThread();
  }
  return conversationThreadModulePromise;
}

const RecruitingConversationThread = lazy(loadRecruitingConversationThread);

export async function preloadRecruitingConversationThread() {
  await loadRecruitingConversationThread();
}

export function LazyRecruitingConversationThread(props: RecruitingConversationThreadProps) {
  return (
    <Suspense fallback={<ChatConversationThreadSkeleton />}>
      <RecruitingConversationThread {...props} />
    </Suspense>
  );
}
