import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import ChatPageClient from "@/app/(auth)/chat/_components/chat-page-client";
import type { ChatConversationDetail } from "@/lib/api/endpoints/chat";
import { auth } from "@/lib/auth";
import { getUserConversation } from "@/server/queries/chat";

// 之前用 "use cache" + cacheLife("max") 静态化, 但每次进入都需要从 DB 读取最新的
// `activeWorkflowRunId` / 历史消息 / JD 配置, 所以这里换成动态 SSR ——
// 由服务端把 initialConversation 一次性塞给客户端, 替换原来"客户端再 fetch"的双段加载。
//
// Previously this was statically rendered with `"use cache"` + cacheLife("max"),
// but the page needs the latest `activeWorkflowRunId` / messages / JD config
// from the DB on every visit, so it's now dynamic SSR. The conversation is
// resolved server-side and handed to the client in one shot, replacing the
// old "render shell → client fetch" two-phase load.
export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    redirect("/login");
  }

  const record = await getUserConversation(session.user.id, sessionId);
  if (!record) {
    notFound();
  }

  // Server queries return `Date` for createdAt/updatedAt; the client-facing
  // `ChatConversationDetail` shape uses ms timestamps because that's what the
  // existing API endpoints serialize over the wire. Normalize at the boundary.
  const initialConversation: ChatConversationDetail = {
    ...record,
    createdAt: record.createdAt.getTime(),
    updatedAt: record.updatedAt.getTime(),
  };

  return (
    <ChatPageClient
      initialSessionId={sessionId}
      initialConversation={initialConversation}
      key={sessionId}
    />
  );
}
