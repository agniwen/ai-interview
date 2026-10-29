import type { ReceivedMessage } from "@livekit/components-react";

export function interviewConnectionState(message: ReceivedMessage) {
  if (message.type === "chatMessage" || !message.from?.isAgent) {
    return null;
  }
  const state = message.attributes?.["interview.connection_state"];
  return state === "reconnecting" || state === "reconnected" ? state : null;
}

export function interviewConnectionText(state: "reconnecting" | "reconnected") {
  return state === "reconnected"
    ? "已重新连接，可以继续面试。"
    : "连接暂时中断，正在自动重连，请稍候。";
}
