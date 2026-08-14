import { Combobox } from "@mastra/playground-ui/components/Combobox";
import { Label } from "@mastra/playground-ui/components/Label";
import { useMemo } from "react";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";

export interface ScorerSelectorProps {
  selectedScorers: string[];
  setSelectedScorers: (scorers: string[]) => void;
  disabled?: boolean;
  container?: React.RefObject<HTMLElement | null>;
}

export function ScorerSelector({
  selectedScorers,
  setSelectedScorers,
  disabled = false,
  container,
}: ScorerSelectorProps) {
  const { data: scorers, isLoading } = useScorers();

  const options = useMemo(() => {
    if (!scorers) {
      return [];
    }
    return Object.entries(scorers).map(([id, scorer]) => ({
      description:
        (scorer as { scorer?: { config?: { description?: string } } }).scorer?.config
          ?.description || "",
      label: (scorer as { scorer?: { config?: { name?: string } } }).scorer?.config?.name || id,
      value: id,
    }));
  }, [scorers]);

  return (
    <div className="grid gap-2">
      <Label>评分器（可选）</Label>
      <Combobox
        multiple
        options={options}
        value={selectedScorers}
        onValueChange={setSelectedScorers}
        placeholder="选择评分器..."
        searchPlaceholder="搜索评分器..."
        emptyText="暂无可用评分器"
        disabled={disabled || isLoading}
        container={container}
      />
    </div>
  );
}
