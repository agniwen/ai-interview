import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useEffect } from "react";
import { useProcessors } from "../hooks/use-processors";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface ProcessorComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
}

export function ProcessorCombobox({
  value,
  onValueChange,
  placeholder = "选择处理器...",
  searchPlaceholder = "搜索处理器...",
  emptyText = "未找到处理器。",
  className,
  disabled = false,
  variant,
}: ProcessorComboboxProps) {
  const { data: processors = {}, isLoading, isError, error } = useProcessors();
  const { navigate, paths } = useLinkComponent();

  useEffect(() => {
    if (isError) {
      const errorMessage = error instanceof Error ? error.message : "加载处理器失败";
      toast.error(`加载处理器时出错：${errorMessage}`);
    }
  }, [isError, error]);

  const processorOptions = Object.keys(processors)
    .filter((key) => {
      const processor = processors[key];
      return processor?.phases && processor.phases.length > 0;
    })
    .map((key) => ({
      label: processors[key]?.name || key,
      value: key,
    }));

  const handleValueChange = (newProcessorId: string) => {
    if (onValueChange) {
      onValueChange(newProcessorId);
    } else if (newProcessorId && newProcessorId !== value) {
      const processor = processors[newProcessorId];
      if (processor?.isWorkflow) {
        navigate(`${paths.workflowLink(newProcessorId)}/graph`);
      } else {
        navigate(paths.processorLink(newProcessorId));
      }
    }
  };

  return (
    <Combobox
      options={processorOptions}
      value={value}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "正在加载处理器..." : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      className={className}
      disabled={disabled || isLoading || isError}
      variant={variant}
    />
  );
}
