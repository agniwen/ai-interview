import { createFileRoute } from "@tanstack/react-router";
import { CreateLayoutWrapper } from "@/components/features/mastra-studio/upstream/pages/cms/agents/create-layout";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/cms/agents/create")({
  component: CreateLayoutWrapper,
  staticData: {
    handle: navHandleWithChildren("/agents", [{ id: "create-agent", label: "Create agent" }]),
  },
});
