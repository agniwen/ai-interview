import { createFileRoute } from "@tanstack/react-router";
import { McpConnectionsPage } from "@/components/features/mcp/mcp-connections-page";

export const Route = createFileRoute("/mcp/connections")({
  ssr: false,
  component: McpConnectionsPage,
  head: () => ({ meta: [{ title: "已授权应用 · 招聘工作台" }] }),
});
