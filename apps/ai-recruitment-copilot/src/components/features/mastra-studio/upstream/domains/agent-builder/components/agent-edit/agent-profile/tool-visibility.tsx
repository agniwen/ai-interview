import type { ReactNode } from "react";
import type { AgentTool } from "../../../types/agent-tool";
import { BUILT_IN_TOOLKIT_ID } from "./use-provider-toolkit-groups";

export const toolkitOf = (item: AgentTool): string =>
  item.type === "integration" && item.toolkit ? item.toolkit : BUILT_IN_TOOLKIT_ID;

export function getVisibleTools(
  availableAgentTools: AgentTool[],
  search: string,
  onlySelected: boolean,
  selectedToolkits: Set<string> | null,
): AgentTool[] {
  const term = search.trim().toLowerCase();

  return availableAgentTools.filter((item) => {
    if (selectedToolkits !== null && !selectedToolkits.has(toolkitOf(item))) {
      return false;
    }
    if (onlySelected && !item.isChecked) {
      return false;
    }
    if (!term) {
      return true;
    }
    return (
      item.name.toLowerCase().includes(term) ||
      (item.description?.toLowerCase().includes(term) ?? false)
    );
  });
}

export function getEmptyStateDetails(args: {
  allToolkitsUnchecked: boolean;
  onlySelected: boolean;
  search: string;
}): ReactNode {
  const trimmedSearch = args.search.trim();
  if (args.allToolkitsUnchecked) {
    return "至少选择一个工具包以查看工具";
  }
  if (args.onlySelected && trimmedSearch === "") {
    return "尚未选择工具";
  }
  if (args.onlySelected) {
    return <>已选工具中没有匹配“{trimmedSearch}”的结果</>;
  }
  return (
    <>
      没有工具匹配“<strong>{trimmedSearch}</strong>”
    </>
  );
}
