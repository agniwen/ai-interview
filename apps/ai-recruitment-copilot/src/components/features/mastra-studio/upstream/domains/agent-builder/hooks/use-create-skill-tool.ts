import { createTool } from "@mastra/client-js";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod/v4";

import type { AvailableWorkspace } from "./use-agent-builder-tool";
import type { AgentBuilderEditFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/schemas";
import {
  createInitialStructure,
  updateNodeContent,
} from "@/components/features/mastra-studio/upstream/domains/agents/components/agent-cms-pages/skill-file-tree-utils";
import { useCreateSkill } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-create-skill";
import { useDefaultVisibility } from "@/components/features/mastra-studio/upstream/domains/auth/hooks/use-default-visibility";

export const CREATE_SKILL_TOOL_NAME = "createSkillTool";

interface UseCreateSkillToolArgs {
  availableWorkspaces?: AvailableWorkspace[];
}

export function useCreateSkillTool({ availableWorkspaces = [] }: UseCreateSkillToolArgs = {}) {
  const formMethods = useFormContext<AgentBuilderEditFormValues>();
  const createSkill = useCreateSkill();
  const defaultVisibility = useDefaultVisibility();

  return useMemo(() => {
    const workspaceIds = availableWorkspaces.map((w) => w.id);
    const hasWorkspaces = workspaceIds.length > 0;

    let workspaceField: z.ZodType<string | undefined> = z.string().optional();
    if (workspaceIds.length > 1) {
      workspaceField = z.enum(workspaceIds as [string, ...string[]]);
    } else if (hasWorkspaces) {
      workspaceField = z.enum(workspaceIds as [string, ...string[]]).optional();
    }

    const inputSchema = z.object({
      description: z.string().min(1),
      instructions: z.string().min(1),
      name: z.string().min(1),
      visibility: z.enum(["private", "public"]).optional(),
      workspaceId: workspaceField,
    });

    const workspacesBlock = hasWorkspaces
      ? `\n\nAvailable workspaces (use these ids in the "workspaceId" field):\n${availableWorkspaces
          .map((w) => `- ${w.id}: ${w.name}`)
          .join("\n")}`
      : "";

    return createTool({
      description:
        `Create a new stored skill and automatically attach it to the agent currently being edited. ` +
        `Provide \`name\`, \`description\`, and \`instructions\` (markdown body for SKILL.md). ` +
        `Optionally provide \`workspaceId\` (required when more than one workspace is available) and \`visibility\` (defaults to "private"). ` +
        `On success the new skill is added to the agent's selected skills.${workspacesBlock}`,
      execute: async (inputData: unknown) => {
        const parsedInput = inputSchema.parse(inputData);
        const { description, instructions, name, visibility } = parsedInput;

        let workspaceId: string | undefined =
          typeof parsedInput.workspaceId === "string" && parsedInput.workspaceId.length > 0
            ? parsedInput.workspaceId
            : undefined;

        if (!workspaceId && availableWorkspaces.length === 1) {
          workspaceId = availableWorkspaces[0]?.id;
        }

        if (!workspaceId) {
          return { error: "没有可用于创建技能的工作区。", success: false };
        }

        const initial = createInitialStructure(name);
        const files = updateNodeContent(initial, "skill-md", instructions);

        try {
          const created = await createSkill.mutateAsync({
            description,
            files,
            name,
            visibility: visibility ?? defaultVisibility,
            workspaceId,
          });

          const currentSkills = formMethods.getValues("skills") ?? {};
          formMethods.setValue(
            "skills",
            { ...currentSkills, [created.id]: true },
            { shouldDirty: true },
          );

          return { skillId: created.id, success: true };
        } catch (error) {
          return {
            error: error instanceof Error ? error.message : "创建技能失败",
            success: false,
          };
        }
      },
      id: CREATE_SKILL_TOOL_NAME,
      inputSchema,
      outputSchema: z.object({
        error: z.string().optional(),
        skillId: z.string().optional(),
        success: z.boolean(),
      }),
    });
  }, [formMethods, createSkill, availableWorkspaces, defaultVisibility]);
}
