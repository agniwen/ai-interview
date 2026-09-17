import { createFileRoute } from "@tanstack/react-router";
import { McpIntroPage } from "@/components/features/mcp/mcp-intro-page";

export const Route = createFileRoute("/mcp/")({
  component: McpIntroPage,
  head: () => ({
    meta: [
      { title: "MCP 接入 · 招聘工作台" },
      { content: "连接你的 Agent，查询岗位、候选人和面试报告。", name: "description" },
    ],
  }),
  ssr: false,
});
