import { createFileRoute } from "@tanstack/react-router";
import AgentTool from "@/components/features/mastra-studio/upstream/pages/tools/agent-tool";
import {
  AgentCrumb,
  AgentToolCrumb,
} from "@/components/features/mastra-studio/upstream/domains/agents/agent-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/agents_/$agentId_/tools/$toolId",
)({
  component: AgentTool,
  staticData: {
    handle: navHandleWithChildren("/agents", [
      { Component: AgentCrumb, heading: "Agent", id: "agent" },
      { Component: AgentToolCrumb, heading: "Agent tool", id: "agent-tool" },
    ]),
  },
});
