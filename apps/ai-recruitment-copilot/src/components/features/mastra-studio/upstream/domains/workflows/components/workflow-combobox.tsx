import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useEffect } from "react";
import { useWorkflows } from "../hooks/use-workflows";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface WorkflowComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
}

export function WorkflowCombobox({
  value,
  onValueChange,
  placeholder = "选择工作流...",
  searchPlaceholder = "搜索工作流...",
  emptyText = "未找到工作流。",
  className,
  disabled = false,
  variant,
}: WorkflowComboboxProps) {
  const { data: workflows = {}, isLoading, isError, error } = useWorkflows();
  const { navigate, paths } = useLinkComponent();

  useEffect(() => {
    if (isError) {
      const errorMessage = error instanceof Error ? error.message : "加载工作流失败";
      toast.error(`加载工作流时出错：${errorMessage}`);
    }
  }, [isError, error]);

  const workflowOptions = Object.keys(workflows).map((key) => ({
    label: workflows[key]?.name || key,
    value: key,
  }));

  const handleValueChange = (newWorkflowId: string) => {
    if (onValueChange) {
      onValueChange(newWorkflowId);
    } else if (newWorkflowId && newWorkflowId !== value) {
      navigate(paths.workflowLink(newWorkflowId));
    }
  };

  return (
    <Combobox
      options={workflowOptions}
      value={value}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "正在加载工作流..." : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      className={className}
      disabled={disabled || isLoading || isError}
      variant={variant}
    />
  );
}
