export const CHAT_EVENTS = {
  conversationsChanged: "chat:conversations-changed",
  sessionPathUpdated: "chat:session-path-updated",
  startNewConversation: "chat:start-new-conversation",
} as const;

export interface ChatSessionPathUpdatedDetail {
  pathname: string;
  sessionId: string | null;
}

export function notifyConversationsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(CHAT_EVENTS.conversationsChanged));
}
