import { createFileRoute } from "@tanstack/react-router";
import { ChatPageSkeleton } from "@/components/features/chat/chat-page-skeleton";
import ChatWorkspace from "@/components/features/chat/chat-workspace";

function AgentIndexRoute() {
  return <ChatWorkspace initialSessionId={null} key="new-agent" />;
}

export const Route = createFileRoute("/w/$slug/agent/")({
  component: AgentIndexRoute,
  head: () => ({
    meta: [
      {
        content: "Workspace 级招聘 Copilot，可检索招聘台和岗位库并协助推进招聘动作。",
        name: "description",
      },
      { title: "招聘 Copilot | Agent" },
    ],
  }),
  pendingComponent: ChatPageSkeleton,
});
