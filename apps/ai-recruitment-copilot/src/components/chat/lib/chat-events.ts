export const CHAT_EVENTS = {
  conversationsChanged: "chat:conversations-changed",
  startNewConversation: "chat:start-new-conversation",
} as const;

export function notifyConversationsChanged(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new CustomEvent(CHAT_EVENTS.conversationsChanged));
}
