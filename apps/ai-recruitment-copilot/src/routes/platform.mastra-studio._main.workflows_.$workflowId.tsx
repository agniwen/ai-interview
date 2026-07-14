import { createFileRoute } from "@tanstack/react-router";
import { WorkflowRouteLayout } from "@/components/features/mastra-studio/router/studio-route-wrappers";
import { WorkflowCrumb } from "@/components/features/mastra-studio/upstream/domains/workflows/workflow-crumbs";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/workflows_/$workflowId")({
  component: WorkflowRouteLayout,
  staticData: {
    handle: navHandleWithChildren("/workflows", [
      { Component: WorkflowCrumb, heading: "Workflow", id: "workflow" },
    ]),
  },
});
