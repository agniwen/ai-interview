import { createTool } from "@mastra/client-js";
import { useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { z } from "zod/v4";

import type { AgentBuilderEditFormValues } from "@/components/features/mastra-studio/upstream/domains/agent-builder/schemas";
import type { ModelInfo } from "@/components/features/mastra-studio/upstream/domains/llm/hooks/use-filtered-models";
import { cleanProviderId } from "@/components/features/mastra-studio/upstream/domains/llm/utils";

export const SET_AGENT_MODEL_TOOL_NAME = "set-agent-model";

interface UseSetAgentModelToolArgs {
  availableModels: ModelInfo[];
}

export function useSetAgentModelTool({ availableModels }: UseSetAgentModelToolArgs) {
  const formMethods = useFormContext<AgentBuilderEditFormValues>();

  return useMemo(() => {
    const modelSchemas = availableModels.map((model) =>
      z.object({
        name: z.literal(model.model).describe("The model name from the available models list."),
        provider: z
          .literal(model.provider)
          .describe("The provider id from the available models list."),
      }),
    );

    let modelSchema: z.ZodType;
    if (modelSchemas.length === 0) {
      modelSchema = z.object({ name: z.string().min(1), provider: z.string().min(1) });
    } else if (modelSchemas.length === 1) {
      const [onlyModelSchema] = modelSchemas;
      modelSchema = onlyModelSchema ?? z.never();
    } else {
      modelSchema = z.union(
        modelSchemas as [
          z.ZodObject<{ provider: z.ZodLiteral<string>; name: z.ZodLiteral<string> }>,
          z.ZodObject<{ provider: z.ZodLiteral<string>; name: z.ZodLiteral<string> }>,
          ...z.ZodObject<{ provider: z.ZodLiteral<string>; name: z.ZodLiteral<string> }>[],
        ],
      );
    }

    const availableModelsBlock =
      availableModels.length > 0
        ? `\n\nAvailable models (use these exact provider/name pairs in the "model" field):\n${availableModels
            .map(
              (model) =>
                `- provider: ${model.provider} (${model.providerName}), name: ${model.model}`,
            )
            .join("\n")}`
        : "";

    return createTool({
      description: `Set the model used by the agent. Only use a provider/name pair from the available models list.${
        availableModelsBlock
      }`,
      execute: (inputData: { model: unknown }) => {
        const modelInput = inputData.model;
        if (
          modelInput &&
          typeof modelInput === "object" &&
          "provider" in modelInput &&
          typeof modelInput.provider === "string" &&
          modelInput.provider.length > 0 &&
          "name" in modelInput &&
          typeof modelInput.name === "string" &&
          modelInput.name.length > 0
        ) {
          formMethods.setValue(
            "model",
            { name: modelInput.name, provider: cleanProviderId(modelInput.provider) },
            { shouldDirty: true },
          );
        }
        return Promise.resolve({ success: true });
      },
      id: SET_AGENT_MODEL_TOOL_NAME,
      inputSchema: z.object({
        model: modelSchema.describe(
          "Model to use for the agent. Use one of the available provider/name pairs.",
        ),
      }),
      outputSchema: z.object({ success: z.boolean() }),
    });
  }, [formMethods, availableModels]);
}
