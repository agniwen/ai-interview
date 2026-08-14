import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/platform/mastra-studio/_main/workflows_/$workflowId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      href: `/platform/mastra-studio/workflows/${params.workflowId}/graph`,
    });
  },
});
