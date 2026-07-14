import { createFileRoute, useParams } from "@tanstack/react-router";
import { AgentDebugPage } from "@/components/features/studio/agent-debug/agent-debug-page";
import { AgentDebugPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { requireStudioAdminAccess } from "@/lib/start/studio/page-access";

function AgentDebugRoute() {
  const { slug } = useParams({ from: "/w/$slug/studio/agent-debug" });
  return <AgentDebugPage slug={slug} />;
}

export const Route = createFileRoute("/w/$slug/studio/agent-debug")({
  component: AgentDebugRoute,
  head: () => ({
    meta: [{ title: "Agent 调试" }],
  }),
  loader: async ({ params }) => {
    const pathname = `/w/${params.slug}/studio/agent-debug`;
    await requireStudioAdminAccess({
      action: "agentDebug",
      pathname,
      slug: params.slug,
    });
  },
  pendingComponent: AgentDebugPageSkeleton,
});
