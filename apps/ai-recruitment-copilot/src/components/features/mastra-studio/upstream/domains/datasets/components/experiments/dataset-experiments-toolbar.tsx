"use client";

import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { Chip } from "@mastra/playground-ui/components/Chip";
import { SelectFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { GitCompare, MoveRightIcon, XIcon } from "lucide-react";
import type { DatasetExperimentsFilters } from "../../hooks/use-dataset-experiments";

const STATUS_OPTIONS = [
  { label: "All statuses", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Running", value: "running" },
  { label: "Completed", value: "completed" },
  { label: "Failed", value: "failed" },
];

const TARGET_TYPE_OPTIONS = [
  { label: "All types", value: "all" },
  { label: "Agent", value: "agent" },
  { label: "Workflow", value: "workflow" },
  { label: "Scorer", value: "scorer" },
  { label: "Processor", value: "processor" },
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
    { label: "All targets", value: "all" },
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
            <span>of 2 experiments selected</span>
            <MoveRightIcon />
          </div>
          <ButtonsGroup>
            <Button variant="primary" disabled={selectedCount !== 2} onClick={onExecuteCompare}>
              <GitCompare className="w-4 h-4" />
              Compare Experiments
            </Button>
            <Button onClick={onCancelSelection}>Cancel</Button>
          </ButtonsGroup>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-4 w-full">
      <ButtonsGroup>
        <SelectFieldBlock
          label="Status"
          labelIsHidden={true}
          name="filter-status"
          options={STATUS_OPTIONS}
          value={filters.status ?? "all"}
          onValueChange={(v) =>
            onFiltersChange({ ...filters, status: v === "all" ? undefined : v })
          }
        />

        <SelectFieldBlock
          label="Type"
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
            label="Target"
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
            Reset
          </Button>
        )}
      </ButtonsGroup>

      {hasExperiments && (
        <Button onClick={onCompareClick}>
          <GitCompare />
          Compare
        </Button>
      )}
    </div>
  );
}
