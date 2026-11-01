// 智能体与 Studio 侧面板 Hireseer Agent 共用的消息样式，两处气泡保持一致。
// Message styles shared by the workspace copilot thread and the Studio side-pane agent.

export const userMessageRootClass =
  "aui-user-message fade-in slide-in-from-bottom-1 animate-in flex w-full flex-col items-end gap-1 duration-150";

export const userMessageBubbleClass =
  "aui-user-message-content max-w-[70%] rounded-[14px] border border-transparent bg-control px-3.5 py-2 text-foreground text-sm leading-6 shadow-default wrap-break-word empty:hidden";

export const assistantMessageRootClass =
  "aui-assistant-message fade-in slide-in-from-bottom-1 animate-in relative w-full min-w-0 px-2 duration-150";

export const assistantMessageContentClass =
  "aui-assistant-message-content min-w-0 max-w-full text-foreground leading-7 wrap-break-word";
