import { createTool } from "@mastra/client-js";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod/v4";

import type { AgentBuilderEditFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/schemas";

export const SET_AGENT_DESCRIPTION_TOOL_NAME = "set-agent-description";

export function useSetAgentDescriptionTool() {
  const formMethods = useFormContext<AgentBuilderEditFormValues>();

  return useMemo(
    () =>
      createTool({
        description:
          "Set the agent description. Use this for a short, human-readable summary of what this agent does. Shown to users when browsing agents. Keep it concise (one sentence).",
        execute: (inputData: { description: string }) => {
          formMethods.setValue("description", inputData.description, { shouldDirty: true });
          return Promise.resolve({ success: true });
        },
        id: SET_AGENT_DESCRIPTION_TOOL_NAME,
        inputSchema: z.object({
          description: z
            .string()
            .describe(
              "A short, human-readable summary of what this agent does. Shown to users when browsing agents. Keep it concise (one sentence).",
            ),
        }),
        outputSchema: z.object({ success: z.boolean() }),
      }),
    [formMethods],
  );
}
