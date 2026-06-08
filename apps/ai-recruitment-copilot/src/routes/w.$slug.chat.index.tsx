import { createFileRoute } from "@tanstack/react-router";
import ChatWorkspace from "@/components/chat/chat-workspace";

function ChatIndexRoute() {
  return <ChatWorkspace initialSessionId={null} key="new-chat" />;
}

export const Route = createFileRoute("/w/$slug/chat/")({
  component: ChatIndexRoute,
  head: () => ({
    meta: [
      {
        content: "支持上传候选人简历、整理筛选要求，并生成聊天式初筛建议。",
        name: "description",
      },
      { title: "AI 筛选助手 | Chat" },
    ],
  }),
});
