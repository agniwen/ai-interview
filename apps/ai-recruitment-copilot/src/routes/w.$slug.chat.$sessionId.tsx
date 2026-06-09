import { createFileRoute, useParams } from "@tanstack/react-router";
import ChatWorkspace from "@/components/chat/chat-workspace";

function ChatSessionRoute() {
  const { sessionId } = useParams({ from: "/w/$slug/chat/$sessionId" });

  return <ChatWorkspace initialSessionId={sessionId} key={sessionId} />;
}

export const Route = createFileRoute("/w/$slug/chat/$sessionId")({
  component: ChatSessionRoute,
});
