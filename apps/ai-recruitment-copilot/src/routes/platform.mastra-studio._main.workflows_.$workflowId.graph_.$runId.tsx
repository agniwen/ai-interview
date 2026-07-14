import { createFileRoute } from "@tanstack/react-router";
import { Workflow } from "@/components/features/mastra-studio/upstream/pages/workflows/workflow";
import { WorkflowRunCrumb } from "@/components/features/mastra-studio/upstream/domains/workflows/workflow-crumbs";
import type { RouteHeaderHandle } from "@/components/features/mastra-studio/upstream/lib/route-header";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/workflows_/$workflowId/graph_/$runId",
)({
  component: Workflow,
  staticData: {
    handle: {
      crumbs: [{ Component: WorkflowRunCrumb, heading: "Workflow run", id: "workflow-run" }],
    } satisfies RouteHeaderHandle,
  },
});
