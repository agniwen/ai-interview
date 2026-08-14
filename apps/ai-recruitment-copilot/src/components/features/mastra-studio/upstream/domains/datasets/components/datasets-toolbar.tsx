import { Button } from "@mastra/playground-ui/components/Button";
import { ButtonsGroup } from "@mastra/playground-ui/components/ButtonsGroup";
import { SelectFieldBlock } from "@mastra/playground-ui/components/FormFieldBlocks";
import { ListSearch } from "@mastra/playground-ui/components/ListSearch";
import { Plus, XIcon } from "lucide-react";
import { DATASET_EXPERIMENT_OPTIONS, DATASET_TARGET_OPTIONS } from "./datasets-list/helpers";

export interface DatasetsToolbarTagOption {
  value: string;
  label: string;
}

export interface DatasetsToolbarProps {
  search: string;
  onSearchChange: (query: string) => void;
  targetFilter: string;
  onTargetFilterChange: (value: string) => void;
  experimentFilter: string;
  onExperimentFilterChange: (value: string) => void;
  tagFilter: string;
  onTagFilterChange: (value: string) => void;
  tagOptions: DatasetsToolbarTagOption[];
  onReset?: () => void;
  hasActiveFilters?: boolean;
  onCreateClick?: () => void;
  createTooltip?: string;
}

export function DatasetsToolbar({
  search,
  onSearchChange,
  targetFilter,
  onTargetFilterChange,
  experimentFilter,
  onExperimentFilterChange,
  tagFilter,
  onTagFilterChange,
  tagOptions,
  onReset,
  hasActiveFilters,
  onCreateClick,
  createTooltip = "创建数据集",
}: DatasetsToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="min-w-64 max-w-120 flex-1">
        <ListSearch
          label="搜索数据集"
          placeholder="按数据集名称筛选"
          value={search}
          onSearch={onSearchChange}
        />
      </div>
      <ButtonsGroup>
        <SelectFieldBlock
          label="目标"
          labelIsHidden
          name="filter-target"
          options={[...DATASET_TARGET_OPTIONS]}
          value={targetFilter}
          onValueChange={onTargetFilterChange}
          className="whitespace-nowrap"
        />
        <SelectFieldBlock
          label="实验"
          labelIsHidden
          name="filter-experiments"
          options={[...DATASET_EXPERIMENT_OPTIONS]}
          value={experimentFilter}
          onValueChange={onExperimentFilterChange}
          className="whitespace-nowrap"
        />
        {tagOptions.length > 1 && (
          <SelectFieldBlock
            label="标签"
            labelIsHidden
            name="filter-tags"
            options={tagOptions}
            value={tagFilter}
            onValueChange={onTagFilterChange}
            className="whitespace-nowrap"
          />
        )}
        {onReset && hasActiveFilters && (
          <Button onClick={onReset} size="sm" variant="default">
            <XIcon className="size-3" /> 重置
          </Button>
        )}
      </ButtonsGroup>
      {onCreateClick && (
        <Button
          onClick={onCreateClick}
          tooltip={createTooltip}
          variant="primary"
          className="ml-auto shrink-0"
        >
          <Plus />
        </Button>
      )}
    </div>
  );
}
