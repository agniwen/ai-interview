export const CHAT_EVENTS = {
  conversationsChanged: "chat:conversations-changed",
  startNewConversation: "chat:start-new-conversation",
} as const;

export function notifyConversationsChanged(): void {
  const browserWindow = globalThis.window;
  if (!browserWindow) {
    return;
  }
  browserWindow.dispatchEvent(new CustomEvent(CHAT_EVENTS.conversationsChanged));
}
