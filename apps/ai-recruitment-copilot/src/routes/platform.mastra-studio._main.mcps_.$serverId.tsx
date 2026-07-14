import { createFileRoute } from "@tanstack/react-router";
import { McpServerPage } from "@/components/features/mastra-studio/upstream/pages/mcps/[serverId]";
import { McpServerCrumb } from "@/components/features/mastra-studio/upstream/domains/mcps/mcp-crumbs";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute("/platform/mastra-studio/_main/mcps_/$serverId")({
  component: McpServerPage,
  staticData: {
    handle: navHandleWithChildren("/mcps", [
      { Component: McpServerCrumb, heading: "MCP server", id: "mcp-server" },
    ]),
  },
});
