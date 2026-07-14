import { createFileRoute } from "@tanstack/react-router";
import { Workflow } from "@/components/features/mastra-studio/upstream/pages/workflows/workflow";

export const Route = createFileRoute("/platform/mastra-studio/_main/workflows_/$workflowId/graph")({
  component: Workflow,
});
