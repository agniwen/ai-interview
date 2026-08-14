import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/mastra-studio/_main/agents_/$agentId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: `/platform/mastra-studio/agents/${params.agentId}/chat`,
    });
  },
});
