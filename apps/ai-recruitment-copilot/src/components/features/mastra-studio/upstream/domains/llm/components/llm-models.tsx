import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxOption, ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { Skeleton } from "@mastra/playground-ui/components/Skeleton";
import { useMemo } from "react";
import { useAllModels, useFilteredModels } from "../hooks/use-filtered-models";
import { useLLMProviders } from "../hooks/use-llm-providers";
import { useBuilderFilteredModels } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-filtered-models";
import { useBuilderModelPolicy } from "@/components/features/mastra-studio/upstream/domains/agent-builder/hooks/use-builder-settings";

export interface LLMModelsProps {
  value: string;
  onValueChange: (value: string) => void;
  // Provider ID used to filter models.
  llmId: string;
  variant?: ComboboxProps["variant"];
  size?: ComboboxProps["size"];
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  container?: HTMLElement | ShadowRoot | null | React.RefObject<HTMLElement | ShadowRoot | null>;
  disabled?: boolean;
}

export const LLMModels = ({
  value,
  onValueChange,
  llmId,
  variant,
  size = "md",
  className,
  open,
  onOpenChange,
  container,
  disabled,
}: LLMModelsProps) => {
  const { data: dataProviders, isLoading: providersLoading } = useLLMProviders();
  const providers = dataProviders?.providers || [];

  // Get all models flattened, then drop any disallowed by admin policy
  const policy = useBuilderModelPolicy();
  const allModels = useAllModels(providers);
  const policyAllowedModels = useBuilderFilteredModels(allModels, policy);

  // Filter models by provider
  const filteredModels = useFilteredModels(policyAllowedModels, llmId, "", false);

  // Create model options
  const modelOptions: ComboboxOption[] = useMemo(
    () =>
      filteredModels.map((m) => ({
        label: m.model,
        value: m.model,
      })),
    [filteredModels],
  );

  if (providersLoading) {
    return <Skeleton className="w-full h-8" />;
  }

  return (
    <Combobox
      options={modelOptions}
      value={value}
      onValueChange={onValueChange}
      placeholder="选择模型…"
      searchPlaceholder="搜索模型…"
      emptyText="未找到模型"
      variant={variant}
      className={className}
      open={open}
      onOpenChange={onOpenChange}
      container={container}
      size={size}
      disabled={disabled}
    />
  );
};
