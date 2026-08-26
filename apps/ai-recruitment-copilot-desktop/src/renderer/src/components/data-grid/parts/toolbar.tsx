import { Icon } from "@/components/ui/icon";
import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@arc/shared/utils";
import { DebouncedSearchInput } from "./debounced-search-input";
import { FilterConditions } from "./filter-conditions";
import { isToolbarCondition } from "./filter-config";
import type { ToolbarFilterConfig } from "./filter-config";

export type { ToolbarFilterConfig } from "./filter-config";

export interface ToolbarProps {
  filters?: ToolbarFilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  searchLoading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onResetFilters?: () => void;
  canResetFilters?: boolean;
  toolbarRight?: ReactNode;
  filtersExtra?: ReactNode;
  bulkActionsSlot?: ReactNode;
}

type FilterItemStyle = CSSProperties & { "--data-grid-filter-min-width"?: string };
const EMPTY_VALUES: Record<string, string> = {};

function isFixedFilter(filter: ToolbarFilterConfig) {
  return filter.type === "select" && (filter.required || filter.disabled);
}

export function Toolbar({
  bulkActionsSlot,
  canResetFilters,
  filters,
  filtersExtra,
  filterValues = EMPTY_VALUES,
  onFilterChange,
  onRefresh,
  onResetFilters,
  refreshing,
  searchLoading,
  toolbarRight,
}: ToolbarProps) {
  const conditions = useMemo(
    () => filters?.filter(isToolbarCondition).filter((filter) => !isFixedFilter(filter)) ?? [],
    [filters],
  );
  if (
    !filters?.length &&
    !filtersExtra &&
    !toolbarRight &&
    !onRefresh &&
    !onResetFilters &&
    !bulkActionsSlot
  ) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-col gap-3" data-slot="data-grid-toolbar">
      <div className="flex flex-wrap items-center gap-3">
        <div
          className="flex w-full min-w-0 flex-wrap gap-3 sm:w-auto"
          data-slot="data-grid-toolbar-search"
        >
          {filters?.map((filter) => {
            if (filter.type === "search") {
              const style: FilterItemStyle | undefined = filter.minWidth
                ? { "--data-grid-filter-min-width": filter.minWidth }
                : undefined;
              return (
                <DebouncedSearchInput
                  className="relative w-full min-w-0 sm:w-auto sm:min-w-(--data-grid-filter-min-width)"
                  key={filter.key}
                  loading={searchLoading}
                  onValueChange={(value) => onFilterChange?.(filter.key, value)}
                  placeholder={filter.placeholder}
                  style={style}
                  value={filterValues[filter.key] ?? ""}
                />
              );
            }
            if (filter.type !== "select" || !isFixedFilter(filter)) {
              return null;
            }
            const control = (
              <SearchableSelect
                clearable={false}
                disabled={filter.disabled}
                modal={false}
                onChange={(value) => onFilterChange?.(filter.key, value ?? "")}
                options={filter.options}
                placeholder={filter.label ?? filter.placeholder}
                required={filter.required}
                value={filterValues[filter.key] || null}
              />
            );
            return filter.disabledReason ? (
              <Tooltip key={filter.key}>
                <TooltipTrigger
                  render={
                    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Exposes the reason for the disabled control to keyboard users.
                    <span className="min-w-0 sm:min-w-45" tabIndex={0}>
                      {control}
                    </span>
                  }
                />
                <TooltipContent>{filter.disabledReason}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={filter.key}>{control}</div>
            );
          })}
        </div>
        <div
          className="flex shrink-0 flex-wrap items-center gap-2"
          data-slot="data-grid-toolbar-actions"
        >
          {onRefresh ? (
            <Button disabled={refreshing} onClick={onRefresh} size="icon" variant="outline">
              <Icon icon="ph:arrows-clockwise" className={cn(refreshing && "animate-spin")} />
              <span className="sr-only">刷新</span>
            </Button>
          ) : null}
          {onResetFilters ? (
            <Button
              disabled={!canResetFilters}
              onClick={onResetFilters}
              size="icon"
              variant="outline"
            >
              <Icon icon="ph:funnel-simple-x" />
              <span className="sr-only">重置筛选</span>
            </Button>
          ) : null}
          {toolbarRight ? <div>{toolbarRight}</div> : null}
          {bulkActionsSlot}
        </div>
      </div>
      {conditions.length > 0 || filtersExtra ? (
        <div
          className="flex min-w-0 flex-wrap items-center gap-2"
          data-slot="data-grid-toolbar-filters"
        >
          {conditions.length > 0 ? (
            <FilterConditions
              configs={conditions}
              onChange={onFilterChange}
              values={filterValues}
            />
          ) : null}
          {filtersExtra}
        </div>
      ) : null}
    </div>
  );
}
