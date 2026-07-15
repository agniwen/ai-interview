import type { AgentEditorConfig } from "../../context/agent-edit-form-context";
import type { useSidebarDescriptions } from "./use-sidebar-descriptions";

export interface AgentCmsSection {
  name: string;
  pathSuffix: string;
  descriptionKey: keyof ReturnType<typeof useSidebarDescriptions>;
  required: boolean;
}

export const AGENT_CMS_SECTIONS: AgentCmsSection[] = [
  { descriptionKey: "identity", name: "身份信息", pathSuffix: "", required: true },
  {
    descriptionKey: "instructions",
    name: "指令",
    pathSuffix: "/instruction-blocks",
    required: true,
  },
  { descriptionKey: "tools", name: "工具", pathSuffix: "/tools", required: false },
  { descriptionKey: "agents", name: "智能体", pathSuffix: "/agents", required: false },
  { descriptionKey: "scorers", name: "评分器", pathSuffix: "/scorers", required: false },
  { descriptionKey: "workflows", name: "工作流", pathSuffix: "/workflows", required: false },
  { descriptionKey: "skills", name: "技能", pathSuffix: "/skills", required: false },
  { descriptionKey: "memory", name: "记忆", pathSuffix: "/memory", required: false },
  { descriptionKey: "variables", name: "变量", pathSuffix: "/variables", required: false },
];

/** Sections available when editing a code-defined agent (override mode) */
export function getCodeAgentOverrideSections(editorConfig?: AgentEditorConfig): AgentCmsSection[] {
  if (editorConfig === false) {
    return [];
  }

  const sections = AGENT_CMS_SECTIONS.filter((section) => {
    if (section.descriptionKey === "instructions") {
      return editorConfig?.instructions !== false;
    }
    if (section.descriptionKey === "tools") {
      return editorConfig?.tools !== false;
    }
    return section.descriptionKey === "variables";
  });

  return sections;
}
