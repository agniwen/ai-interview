import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

import type { AgentFormValues } from "./utils/form-validation";
import { createInstructionBlock } from "./utils/form-validation";
import { firstDefined } from "../../utils/presence";

type FormErrors = Record<string, { type: string; message: string }>;

function validateEditableFields(values: AgentFormValues, errors: FormErrors): void {
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
  if (!values.model?.provider || values.model.provider.trim() === "") {
    errors["model.provider"] = { message: "Provider is required", type: "required" };
  }
  if (!values.model?.name || values.model.name.trim() === "") {
    errors["model.name"] = { message: "Model is required", type: "required" };
  }
}

function hasInstructions(values: AgentFormValues): boolean {
  const hasBlockContent = values.instructionBlocks?.some((block) => {
    if (block.type === "prompt_block_ref") {
      return Boolean(block.promptBlockId?.trim());
    }
    return Boolean(block.content.trim());
  });
  return Boolean(hasBlockContent || values.instructions?.trim());
}

// Simple validation resolver without zod to avoid version conflicts
function createAgentFormResolver({
  isCodeAgentOverride,
}: { isCodeAgentOverride?: boolean } = {}): Resolver<AgentFormValues> {
  return (values) => {
    const errors: FormErrors = {};

    if (!isCodeAgentOverride) {
      validateEditableFields(values, errors);
    }

    // Validate instructions: check blocks if present, otherwise check plain instructions string.
    // Skip for code-agent overrides — instructions may not be Studio-editable (e.g. descriptions-only
    // mode locks instructions), and the server only persists overridable fields anyway.
    if (!isCodeAgentOverride && !hasInstructions(values)) {
      errors.instructions = { message: "Instructions are required", type: "required" };
    }

    const hasErrors = Object.keys(errors).length > 0;

    if (hasErrors) {
      return { errors, values: {} };
    }
    return { errors: {}, values };
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
      agents: firstDefined(initialValues?.agents, {}),
      description: firstDefined(initialValues?.description, ""),
      instructionBlocks: firstDefined(initialValues?.instructionBlocks, [createInstructionBlock()]),
      instructions: firstDefined(initialValues?.instructions, ""),
      integrationTools: firstDefined(initialValues?.integrationTools, {}),
      mcpClients: firstDefined(initialValues?.mcpClients, []),
      mcpClientsToDelete: [],
      model: firstDefined(initialValues?.model, { name: "", provider: "" }),
      name: firstDefined(initialValues?.name, ""),
      scorers: firstDefined(initialValues?.scorers, {}),
      skills: firstDefined(initialValues?.skills, {}),
      tools: firstDefined(initialValues?.tools, {}),
      variables: firstDefined(initialValues?.variables, {}),
      workflows: firstDefined(initialValues?.workflows, {}),
    },
    resolver: createAgentFormResolver({ isCodeAgentOverride }),
  });

  return { form };
}
