import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

import type { AgentFormValues } from "./utils/form-validation";
import { createInstructionBlock } from "./utils/form-validation";

// Simple validation resolver without zod to avoid version conflicts
function createAgentFormResolver({
  isCodeAgentOverride,
}: { isCodeAgentOverride?: boolean } = {}): Resolver<AgentFormValues> {
  return async (values) => {
    const errors: Record<string, { type: string; message: string }> = {};

    if (!isCodeAgentOverride) {
      if (!values.name || values.name.trim() === "") {
        errors.name = { message: "Name is required", type: "required" };
      } else if (values.name.length > 100) {
        errors.name = { message: "Name must be 100 characters or less", type: "maxLength" };
      }

      if (values.description && values.description.length > 500) {
        errors.description = {
          message: "Description must be 500 characters or less",
          type: "maxLength",
        };
      }
    }

    // Validate instructions: check blocks if present, otherwise check plain instructions string.
    // Skip for code-agent overrides — instructions may not be Studio-editable (e.g. descriptions-only
    // mode locks instructions), and the server only persists overridable fields anyway.
    if (!isCodeAgentOverride) {
      const blocks = values.instructionBlocks;
      const hasBlockContent =
        blocks &&
        blocks.some(
          (b) =>
            (b.type === "prompt_block_ref" && b.promptBlockId?.trim() !== "") ||
            (b.type === "prompt_block" && b.content.trim() !== ""),
        );
      const hasPlainInstructions = values.instructions && values.instructions.trim() !== "";

      if (!hasBlockContent && !hasPlainInstructions) {
        errors.instructions = { message: "Instructions are required", type: "required" };
      }
    }

    if (!isCodeAgentOverride) {
      if (!values.model?.provider || values.model.provider.trim() === "") {
        errors["model.provider"] = { message: "Provider is required", type: "required" };
      }

      if (!values.model?.name || values.model.name.trim() === "") {
        errors["model.name"] = { message: "Model is required", type: "required" };
      }
    }

    return {
      errors: Object.keys(errors).length > 0 ? errors : {},
      values: Object.keys(errors).length === 0 ? values : {},
    };
  };
}

export interface UseAgentEditFormOptions {
  initialValues?: Partial<AgentFormValues>;
  isCodeAgentOverride?: boolean;
}

export function useAgentEditForm(options: UseAgentEditFormOptions = {}) {
  const { initialValues, isCodeAgentOverride } = options;

  const form = useForm<AgentFormValues>({
    defaultValues: {
      agents: initialValues?.agents ?? {},
      description: initialValues?.description ?? "",
      instructionBlocks: initialValues?.instructionBlocks ?? [createInstructionBlock()],
      instructions: initialValues?.instructions ?? "",
      integrationTools: initialValues?.integrationTools ?? {},
      mcpClients: initialValues?.mcpClients ?? [],
      mcpClientsToDelete: [],
      model: initialValues?.model ?? { name: "", provider: "" },
      name: initialValues?.name ?? "",
      scorers: initialValues?.scorers ?? {},
      skills: initialValues?.skills ?? {},
      tools: initialValues?.tools ?? {},
      variables: initialValues?.variables ?? {},
      workflows: initialValues?.workflows ?? {},
    },
    resolver: createAgentFormResolver({ isCodeAgentOverride }),
  });

  return { form };
}
