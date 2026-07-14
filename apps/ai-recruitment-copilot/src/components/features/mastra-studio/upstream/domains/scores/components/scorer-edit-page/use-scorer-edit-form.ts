import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

import type { ScorerFormValues } from "./utils/form-validation";

const scorerFormResolver: Resolver<ScorerFormValues> = (values) => {
  const errors: Record<string, { type: string; message: string }> = {};

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

  if (!values.instructions || values.instructions.trim() === "") {
    errors.instructions = { message: "Instructions are required", type: "required" };
  }

  return {
    errors: Object.keys(errors).length > 0 ? errors : {},
    values: Object.keys(errors).length === 0 ? values : {},
  };
};

export interface UseScorerEditFormOptions {
  initialValues?: Partial<ScorerFormValues>;
}

export function useScorerEditForm(options: UseScorerEditFormOptions = {}) {
  const { initialValues } = options;

  const form = useForm<ScorerFormValues>({
    defaultValues: {
      defaultSampling: initialValues?.defaultSampling,
      description: initialValues?.description ?? "",
      instructions: initialValues?.instructions ?? "",
      model: initialValues?.model ?? { name: "", provider: "" },
      name: initialValues?.name ?? "",
      scoreRange: initialValues?.scoreRange ?? { max: 1, min: 0 },
      type: initialValues?.type ?? "llm-judge",
    },
    resolver: scorerFormResolver,
  });

  return { form };
}
