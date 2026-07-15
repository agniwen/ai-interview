import { Combobox } from "@mastra/playground-ui/components/Combobox";
import type { ComboboxProps } from "@mastra/playground-ui/components/Combobox";
import { toast } from "@mastra/playground-ui/utils/toast";
import { useEffect } from "react";
import { useScorers } from "../hooks/use-scorers";
import { useLinkComponent } from "@/components/features/mastra-studio/upstream/lib/framework";

export interface ScorerComboboxProps {
  value?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
  variant?: ComboboxProps["variant"];
}

export function ScorerCombobox({
  value,
  onValueChange,
  placeholder = "选择评分器...",
  searchPlaceholder = "搜索评分器...",
  emptyText = "未找到评分器。",
  className,
  disabled = false,
  variant,
}: ScorerComboboxProps) {
  const { data: scorers = {}, isLoading, isError, error } = useScorers();
  const { navigate, paths } = useLinkComponent();

  useEffect(() => {
    if (isError) {
      const errorMessage = error instanceof Error ? error.message : "加载评分器失败";
      toast.error(`加载评分器时出错：${errorMessage}`);
    }
  }, [isError, error]);

  const scorerOptions = Object.keys(scorers).map((key) => ({
    label: scorers[key]?.scorer.config.name || key,
    value: key,
  }));

  const handleValueChange = (newScorerId: string) => {
    if (onValueChange) {
      onValueChange(newScorerId);
    } else if (newScorerId && newScorerId !== value) {
      navigate(paths.scorerLink(newScorerId));
    }
  };

  return (
    <Combobox
      options={scorerOptions}
      value={value}
      onValueChange={handleValueChange}
      placeholder={isLoading ? "正在加载评分器..." : placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyText={emptyText}
      className={className}
      disabled={disabled || isLoading || isError}
      variant={variant}
      size={"md"}
    />
  );
}
