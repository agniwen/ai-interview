"use client";

import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useEffect } from "react";
import { useDatasets } from "../hooks/use-datasets";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface DatasetComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
}

export function DatasetCombobox({
  value,
  onValueChange,
  placeholder = "选择数据集...",
  searchPlaceholder = "搜索数据集...",
  emptyText = "未找到数据集。",
  className,
  disabled = false,
  variant,
}: DatasetComboboxProps) {
  const { data, isLoading, isError, error } = useDatasets();
  const { navigate, paths } = useLinkComponent();

  useEffect(() => {
    if (isError) {
      const errorMessage = error instanceof Error ? error.message : "加载数据集失败";
      toast.error(`加载数据集时出错：${errorMessage}`);
    }
  }, [isError, error]);

  const datasets = data?.datasets ?? [];
  const datasetOptions = datasets.map((d) => ({
    label: d.name,
    value: d.id,
  }));

  const handleValueChange = (newDatasetId: string) => {
    if (onValueChange) {
      onValueChange(newDatasetId);
    } else if (newDatasetId && newDatasetId !== value) {
      navigate(paths.datasetLink(newDatasetId));
    }
  };

  return (
    <Combobox
      options={datasetOptions}
      value={value}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "正在加载数据集..." : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      className={className}
      disabled={disabled || isLoading || isError}
      variant={variant}
    />
  );
}
