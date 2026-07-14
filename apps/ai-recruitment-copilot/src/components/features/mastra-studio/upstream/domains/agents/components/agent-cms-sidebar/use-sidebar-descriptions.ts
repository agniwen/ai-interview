import { useMemo } from "react";
import { useWatch } from "react-hook-form";
import type { Control } from "react-hook-form";

import type { AgentFormValues } from "../agent-edit-page/utils/form-validation";
import { resolveConditional } from "../../utils/conditional";

function pluralize(count: number, singular: string): string {
  return `${count} ${singular}${resolveConditional(
    count === 1,
    () => "",
    () => "s",
  )}`;
}

function describeCount(count: number, empty: string, singular: string): string {
  return resolveConditional(
    count,
    () => pluralize(count, singular),
    () => empty,
  );
}

function countInstructionBlocks(values: AgentFormValues): number {
  return resolveConditional(
    values.instructionBlocks,
    (blocks) =>
      blocks.filter((block) => {
        if (block.type === "prompt_block_ref") {
          return true;
        }
        return block.type === "prompt_block" && Boolean(block.content?.trim());
      }).length,
    () => 0,
  );
}

function describeIdentity(values: {
  name?: string;
  model?: { provider?: string; name?: string };
}): string {
  if (!values.name || !values.model?.provider || !values.model?.name) {
    return "Required";
  }
  return values.name;
}

export function useSidebarDescriptions(control: Control<AgentFormValues>) {
  const values = useWatch({ control });

  return useMemo(() => {
    const identity = describeIdentity(values);

    const blockCount = countInstructionBlocks(values as AgentFormValues);
    const instructions = describeCount(blockCount, "Required", "block");

    const toolCount =
      Object.keys(values.tools ?? {}).length + Object.keys(values.integrationTools ?? {}).length;
    const tools = describeCount(toolCount, "None selected", "tool");

    const agentCount = Object.keys(values.agents ?? {}).length;
    const agents = describeCount(agentCount, "None selected", "agent");

    const scorerCount = Object.keys(values.scorers ?? {}).length;
    const scorers = describeCount(scorerCount, "None selected", "scorer");

    const workflowCount = Object.keys(values.workflows ?? {}).length;
    const workflows = describeCount(workflowCount, "None selected", "workflow");

    const memory = resolveConditional(values.memory?.enabled, () => "Enabled", () => "Disabled");

    const skillCount = Object.keys(values.skills ?? {}).length;
    const skills = describeCount(skillCount, "None selected", "skill");

    const variableCount = Object.keys(values.variables?.properties ?? {}).length;
    const variables = describeCount(variableCount, "None defined", "variable");

    return {
      agents: { description: agents, done: agentCount > 0 },
      identity: { description: identity, done: identity !== "Required" },
      instructions: { description: instructions, done: blockCount > 0 },
      memory: { description: memory, done: !!values.memory?.enabled },
      scorers: { description: scorers, done: scorerCount > 0 },
      skills: { description: skills, done: skillCount > 0 },
      tools: { description: tools, done: toolCount > 0 },
      variables: { description: variables, done: variableCount > 0 },
      workflows: { description: workflows, done: workflowCount > 0 },
    };
  }, [values]);
}
