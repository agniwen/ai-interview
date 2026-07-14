import type { AgentEditorConfig } from "../../context/agent-edit-form-context";
import type { useSidebarDescriptions } from "./use-sidebar-descriptions";

export interface AgentCmsSection {
  name: string;
  pathSuffix: string;
  descriptionKey: keyof ReturnType<typeof useSidebarDescriptions>;
  required: boolean;
}

export const AGENT_CMS_SECTIONS: AgentCmsSection[] = [
  { descriptionKey: "identity", name: "Identity", pathSuffix: "", required: true },
  {
    descriptionKey: "instructions",
    name: "Instructions",
    pathSuffix: "/instruction-blocks",
    required: true,
  },
  { descriptionKey: "tools", name: "Tools", pathSuffix: "/tools", required: false },
  { descriptionKey: "agents", name: "Agents", pathSuffix: "/agents", required: false },
  { descriptionKey: "scorers", name: "Scorers", pathSuffix: "/scorers", required: false },
  { descriptionKey: "workflows", name: "Workflows", pathSuffix: "/workflows", required: false },
  { descriptionKey: "skills", name: "Skills", pathSuffix: "/skills", required: false },
  { descriptionKey: "memory", name: "Memory", pathSuffix: "/memory", required: false },
  { descriptionKey: "variables", name: "Variables", pathSuffix: "/variables", required: false },
];

/** Sections available when editing a code-defined agent (override mode) */
export function getCodeAgentOverrideSections(editorConfig?: AgentEditorConfig): AgentCmsSection[] {
  if (editorConfig === false) {
    return [];
  }

  const sections = AGENT_CMS_SECTIONS.filter((section) => {
    if (section.name === "Instructions") {
      return editorConfig?.instructions !== false;
    }
    if (section.name === "Tools") {
      return editorConfig?.tools !== false;
    }
    return section.name === "Variables";
  });

  return sections;
}
