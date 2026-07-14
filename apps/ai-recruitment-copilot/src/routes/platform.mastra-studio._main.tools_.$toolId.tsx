import { createFileRoute } from "@tanstack/react-router";
import Tool from "@/components/features/mastra-studio/upstream/pages/tools/tool";
import { ToolCrumb } from "@/components/features/mastra-studio/upstream/domains/tools/tool-crumb";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/tools_/$toolId")({
  component: Tool,
  staticData: {
    handle: navHandleWithChildren("/tools", [
      { Component: ToolCrumb, heading: "Tool", id: "tool" },
    ]),
  },
});
