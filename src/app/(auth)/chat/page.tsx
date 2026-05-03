import type { Metadata } from "next";
import ChatWorkspace from "@/app/(auth)/chat/_components/chat-workspace";

export const metadata: Metadata = {
  description: "支持上传候选人简历、整理筛选要求，并生成聊天式初筛建议。",
  title: "AI 筛选助手 | Chat",
};

// oxlint-disable-next-line require-await -- "use cache" requires the function be async.
export default async function ChatPage() {
  "use cache";
  return <ChatWorkspace initialSessionId={null} key="new-chat" />;
}
