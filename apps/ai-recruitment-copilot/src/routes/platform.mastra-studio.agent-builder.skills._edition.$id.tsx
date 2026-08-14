import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/mastra-studio/agent-builder/skills/_edition/$id")({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: `/platform/mastra-studio/agent-builder/skills/${params.id}/edit`,
    });
  },
});
