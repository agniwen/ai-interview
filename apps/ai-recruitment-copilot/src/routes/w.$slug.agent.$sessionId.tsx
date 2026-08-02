import { createFileRoute, useParams } from "@tanstack/react-router";
import ChatWorkspace from "@/components/features/chat/chat-workspace";

function AgentSessionRoute() {
  const { sessionId } = useParams({ from: "/w/$slug/agent/$sessionId" });

  return <ChatWorkspace initialSessionId={sessionId} key={sessionId} />;
}

export const Route = createFileRoute("/w/$slug/agent/$sessionId")({
  component: AgentSessionRoute,
});
