import { createFileRoute } from "@tanstack/react-router";
import MCPServerToolExecutor from "@/components/features/mastra-studio/upstream/pages/mcps/tool";
import {
  McpServerCrumb,
  McpServerToolCrumb,
} from "@/components/features/mastra-studio/upstream/domains/mcps/mcp-crumbs";
import { navHandleWithChildren } from "@/components/features/mastra-studio/upstream/lib/nav";

export const Route = createFileRoute(
  "/platform/mastra-studio/_main/mcps_/$serverId_/tools/$toolId",
)({
  component: MCPServerToolExecutor,
  staticData: {
    handle: navHandleWithChildren("/mcps", [
      { Component: McpServerCrumb, heading: "MCP server", id: "mcp-server" },
      { Component: McpServerToolCrumb, heading: "MCP server tool", id: "mcp-server-tool" },
    ]),
  },
});
