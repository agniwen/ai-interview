import { Combobox } from "@mastra/playground-ui/components/Combobox";
import { Label } from "@mastra/playground-ui/components/Label";
import { useAgents } from "@/components/features/mastra-studio/upstream/domains/agents/hooks/use-agents";
import { useScorers } from "@/components/features/mastra-studio/upstream/domains/scores/hooks/use-scorers";
import { useWorkflows } from "@/components/features/mastra-studio/upstream/domains/workflows/hooks/use-workflows";

export type TargetType = "agent" | "workflow" | "scorer";

export interface TargetSelectorProps {
  targetType: TargetType | "";
  setTargetType: (type: TargetType | "") => void;
  targetId: string;
  setTargetId: (id: string) => void;
  container?: React.RefObject<HTMLElement | null>;
}

const targetTypeOptions = [
  { label: "智能体", value: "agent" },
  { label: "工作流", value: "workflow" },
  { label: "评分器", value: "scorer" },
];

export function TargetSelector({
  targetType,
  setTargetType,
  targetId,
  setTargetId,
  container,
}: TargetSelectorProps) {
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: workflows, isLoading: workflowsLoading } = useWorkflows();
  const { data: scorers, isLoading: scorersLoading } = useScorers();

  // Get list of targets based on selected type
  let targetOptions: { label: string; value: string }[] = [];
  if (targetType === "agent") {
    targetOptions = Object.entries(agents ?? {}).map(([id, agent]) => ({
      label: agent.name ?? id,
      value: id,
    }));
  } else if (targetType === "workflow") {
    targetOptions = Object.entries(workflows ?? {}).map(([id, workflow]) => ({
      label: workflow.name ?? id,
      value: id,
    }));
  } else if (targetType === "scorer") {
    targetOptions = Object.entries(scorers ?? {}).map(([id, scorer]) => ({
      label: scorer.scorer?.config?.name ?? id,
      value: id,
    }));
  }

  const isTargetsLoading =
    (targetType === "agent" && agentsLoading) ||
    (targetType === "workflow" && workflowsLoading) ||
    (targetType === "scorer" && scorersLoading);

  // Reset targetId when type changes
  const handleTypeChange = (value: string) => {
    setTargetType(value as TargetType);
    setTargetId("");
  };

  let targetLabel = "评分器";
  if (targetType === "agent") {
    targetLabel = "智能体";
  } else if (targetType === "workflow") {
    targetLabel = "工作流";
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Label>目标类型</Label>
        <Combobox
          options={targetTypeOptions}
          value={targetType}
          onValueChange={handleTypeChange}
          placeholder="选择目标类型"
          searchPlaceholder="搜索类型..."
          emptyText="暂无可用类型"
          container={container}
        />
      </div>

      {targetType && (
        <div className="grid gap-2">
          <Label>{targetLabel}</Label>
          <Combobox
            options={targetOptions}
            value={targetId}
            onValueChange={setTargetId}
            placeholder={`选择${targetLabel}`}
            searchPlaceholder="搜索..."
            emptyText="暂无可用目标"
            disabled={isTargetsLoading}
            container={container}
          />
        </div>
      )}
    </div>
  );
}
