import { AgentIcon } from "@mastra/playground-ui/icons/AgentIcon";
import { FolderIcon } from "@mastra/playground-ui/icons/FolderIcon";
import { McpServerIcon } from "@mastra/playground-ui/icons/McpServerIcon";
import { ToolsIcon } from "@mastra/playground-ui/icons/ToolsIcon";
import { WorkflowIcon } from "@mastra/playground-ui/icons/WorkflowIcon";
import { BrainIcon } from "lucide-react";
import type { ExperimentUISpanStyle } from "../types";

export const spanTypePrefixes = ["agent", "workflow", "model", "mcp", "tool", "workspace", "other"];

export function getExperimentSpanTypeUi(type: string): ExperimentUISpanStyle | null {
  const typePrefix = type?.toLowerCase().split("_")[0];

  const spanTypeToUiElements: Record<string, ExperimentUISpanStyle> = {
    agent: {
      bgColor: "bg-oklch(0.75 0.15 250 / 0.1)",
      color: "oklch(0.75 0.15 250)",
      icon: <AgentIcon />,
      label: "智能体",
      typePrefix: "agent",
    },
    mcp: {
      bgColor: "bg-oklch(0.75 0.15 160 / 0.1)",
      color: "oklch(0.75 0.15 160)",
      icon: <McpServerIcon />,
      label: "MCP",
      typePrefix: "mcp",
    },
    model: {
      bgColor: "bg-oklch(0.75 0.15 320 / 0.1)",
      color: "oklch(0.75 0.15 320)",
      icon: <BrainIcon />,
      label: "模型",
      typePrefix: "model",
    },
    tool: {
      bgColor: "bg-oklch(0.75 0.15 100 / 0.1)",
      color: "oklch(0.75 0.15 100)",
      icon: <ToolsIcon />,
      label: "工具",
      typePrefix: "tool",
    },
    workflow: {
      bgColor: "bg-oklch(0.75 0.15 200 / 0.1)",
      color: "oklch(0.75 0.15 200)",
      icon: <WorkflowIcon />,
      label: "工作流",
      typePrefix: "workflow",
    },
    workspace: {
      bgColor: "bg-oklch(0.75 0.15 40 / 0.1)",
      color: "oklch(0.75 0.15 40)",
      icon: <FolderIcon />,
      label: "工作区",
      typePrefix: "workspace",
    },
  };

  if (typePrefix in spanTypeToUiElements) {
    return spanTypeToUiElements[typePrefix];
  }

  return {
    typePrefix: "other",
  };
}
