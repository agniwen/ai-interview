import { createTool } from "@mastra/client-js";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod/v4";

import type { AgentBuilderEditFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/schemas";

export const SET_AGENT_NAME_TOOL_NAME = "set-agent-name";

export function useSetAgentNameTool() {
  const formMethods = useFormContext<AgentBuilderEditFormValues>();

  return useMemo(
    () =>
      createTool({
        description:
          "Set the agent name. Use this when the user provides or revises a short, human-readable name for the agent being built.",
        execute: async (inputData: any) => {
          if (typeof inputData?.name === "string" && inputData.name.length > 0) {
            formMethods.setValue("name", inputData.name, { shouldDirty: true });
          }
          return { success: true };
        },
        id: SET_AGENT_NAME_TOOL_NAME,
        inputSchema: z.object({
          name: z
            .string()
            .min(1)
            .describe("The new agent name. Keep it short and Title Case where appropriate."),
        }),
        outputSchema: z.object({ success: z.boolean() }),
      }),
    [formMethods],
  );
}
