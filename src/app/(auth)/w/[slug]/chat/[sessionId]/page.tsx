import { cacheLife } from "next/cache";
import ChatWorkspace from "@/app/(auth)/w/[slug]/chat/_components/chat-workspace";

export default async function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  "use cache";
  cacheLife("max");

  const { sessionId } = await params;

  return <ChatWorkspace initialSessionId={sessionId} key={sessionId} />;
}
