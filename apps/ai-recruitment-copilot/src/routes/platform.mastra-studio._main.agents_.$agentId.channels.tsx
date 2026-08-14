import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId/channels")({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: `/platform/mastra-studio/agents/${params.agentId}/settings?tab=channels`,
    });
  },
});
