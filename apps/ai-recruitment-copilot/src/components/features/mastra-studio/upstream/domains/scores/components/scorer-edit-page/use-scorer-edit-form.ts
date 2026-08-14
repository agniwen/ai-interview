import type { Resolver } from "react-hook-form";
import { useForm } from "react-hook-form";

import type { ScorerFormValues } from "./utils/form-validation";

const scorerFormResolver: Resolver<ScorerFormValues> = (values) => {
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

  if (!values.model?.provider || values.model.provider.trim() === "") {
    errors["model.provider"] = { message: "提供商为必填项", type: "required" };
  }

  if (!values.model?.name || values.model.name.trim() === "") {
    errors["model.name"] = { message: "模型为必填项", type: "required" };
  }

  if (!values.instructions || values.instructions.trim() === "") {
    errors.instructions = { message: "指令为必填项", type: "required" };
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
