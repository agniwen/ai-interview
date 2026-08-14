"use client";

import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { SelectFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { GitCompare, MoveRightIcon, XIcon } from "lucide-react";
import type { DatasetExperimentsFilters } from "../../hooks/use-dataset-experiments";

const STATUS_OPTIONS = [
  { label: "全部状态", value: "all" },
  { label: "等待中", value: "pending" },
  { label: "运行中", value: "running" },
  { label: "已完成", value: "completed" },
  { label: "失败", value: "failed" },
];

const TARGET_TYPE_OPTIONS = [
  { label: "全部类型", value: "all" },
  { label: "智能体", value: "agent" },
  { label: "工作流", value: "workflow" },
  { label: "评分器", value: "scorer" },
  { label: "处理器", value: "processor" },
];

export interface DatasetExperimentsToolbarProps {
  hasExperiments: boolean;
  onCompareClick: () => void;
  isSelectionActive: boolean;
  selectedCount: number;
  onExecuteCompare: () => void;
  onCancelSelection: () => void;
  filters: DatasetExperimentsFilters;
  onFiltersChange: (filters: DatasetExperimentsFilters) => void;
  targetIds: string[];
}

export function DatasetExperimentsToolbar({
  hasExperiments,
  onCompareClick,
  isSelectionActive,
  selectedCount,
  onExecuteCompare,
  onCancelSelection,
  filters,
  onFiltersChange,
  targetIds,
}: DatasetExperimentsToolbarProps) {
  const targetIdOptions = [
    { label: "全部目标", value: "all" },
    ...targetIds.map((id) => ({ label: id, value: id })),
  ];

  if (isSelectionActive) {
    return (
      <div className="flex items-center justify-end gap-4 w-full">
        <div className="flex gap-5">
          <div className="text-sm text-neutral3 flex items-center gap-2 pl-6">
            <Chip size="large" color={selectedCount < 2 ? "red" : "green"}>
              {selectedCount}
            </Chip>
            <span>（已选择 2 个实验）</span>
            <MoveRightIcon />
          </div>
          <ButtonsGroup>
            <Button variant="primary" disabled={selectedCount !== 2} onClick={onExecuteCompare}>
              <GitCompare className="w-4 h-4" />
              对比实验
            </Button>
            <Button onClick={onCancelSelection}>取消</Button>
          </ButtonsGroup>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 w-full">
      <ButtonsGroup>
        <SelectFieldBlock
          label="状态"
          labelIsHidden={true}
          name="filter-status"
          options={STATUS_OPTIONS}
          value={filters.status ?? "all"}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, status: v === "all" ? undefined : v })
          }
        />

        <SelectFieldBlock
          label="类型"
          labelIsHidden={true}
          name="filter-target-type"
          options={TARGET_TYPE_OPTIONS}
          value={filters.targetType ?? "all"}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, targetType: v === "all" ? undefined : v })
          }
        />

        {targetIds.length > 0 && (
          <SelectFieldBlock
            label="目标"
            labelIsHidden={true}
            name="filter-target-id"
            options={targetIdOptions}
            value={filters.targetId ?? "all"}
            onValueChange={(v) =>
              onFiltersChange({ ...filters, targetId: v === "all" ? undefined : v })
            }
          />
        )}

        {(filters.status || filters.targetType || filters.targetId) && (
          <Button onClick={() => onFiltersChange({})}>
            <XIcon />
            重置
          </Button>
        )}
      </ButtonsGroup>

      {hasExperiments && (
        <Button onClick={onCompareClick}>
          <GitCompare />
          对比
        </Button>
      )}
    </div>
  );
}
