import { createFileRoute } from "@tanstack/react-router";
import { McpAuthorizePage } from "@/components/features/mcp/mcp-authorize-page";

export const Route = createFileRoute("/mcp/authorize")({
  ssr: false,
  component: McpAuthorizePage,
  head: () => ({
    meta: [{ title: "授权访问 · 招聘工作台" }, { name: "referrer", content: "no-referrer" }],
  }),
});
