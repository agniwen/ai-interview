import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

import type { PromptBlockFormValues } from "./utils/form-validation";

const promptBlockFormResolver: Resolver<PromptBlockFormValues> = async (values) => {
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

  if (!values.content || values.content.trim() === "") {
    errors.content = { message: "Content is required", type: "required" };
  }

  return {
    errors: Object.keys(errors).length > 0 ? errors : {},
    values: Object.keys(errors).length === 0 ? values : {},
  };
};

export interface UsePromptBlockEditFormOptions {
  initialValues?: Partial<PromptBlockFormValues>;
}

export function usePromptBlockEditForm(options: UsePromptBlockEditFormOptions = {}) {
  const { initialValues } = options;

  const form = useForm<PromptBlockFormValues>({
    defaultValues: {
      content: initialValues?.content ?? "",
      description: initialValues?.description ?? "",
      name: initialValues?.name ?? "",
      rules: initialValues?.rules,
      variables: initialValues?.variables,
    },
    resolver: promptBlockFormResolver,
  });

  return { form };
}
