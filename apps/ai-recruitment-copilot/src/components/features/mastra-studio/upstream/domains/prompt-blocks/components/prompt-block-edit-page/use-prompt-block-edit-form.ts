import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

import type { PromptBlockFormValues } from "./utils/form-validation";

const promptBlockFormResolver: Resolver<PromptBlockFormValues> = (values) => {
  const errors: Record<string, { type: string; message: string }> = {};

  if (!values.name || values.name.trim() === "") {
    errors.name = { message: "名称为必填项", type: "required" };
  } else if (values.name.length > 100) {
    errors.name = { message: "名称不能超过 100 个字符", type: "maxLength" };
  }

  if (values.description && values.description.length > 500) {
    errors.description = {
      message: "描述不能超过 500 个字符",
      type: "maxLength",
    };
  }

  if (!values.content || values.content.trim() === "") {
    errors.content = { message: "内容为必填项", type: "required" };
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
