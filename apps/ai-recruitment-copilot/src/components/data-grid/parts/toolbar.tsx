import { useFilterSelection } from "./filter-selection";
import { CustomFilterInput } from "./custom-filter-input";
import { IconFilterX, IconRefresh } from "@tabler/icons-react";
import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import {
  listTextFields,
  parseListTextFilters,
  serializeListTextFilters,
} from "@arc/shared/list-text-filters";
import { parseCsvParam } from "@arc/shared/csv";
import { Input } from "@/components/ui/input";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Button } from "@/components/ui/button";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@arc/shared/utils";
import { DebouncedSearchInput } from "./debounced-search-input";
import { FilterConditions } from "./filter-conditions";
import type { ToolbarConditionConfig, ToolbarFilterConfig } from "./filter-config";

export type { ToolbarFilterConfig } from "./filter-config";

export interface ToolbarProps {
  filters?: ToolbarFilterConfig[];
  filterStorageKey?: string;
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  searchLoading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  onResetFilters?: (clearedValues?: Record<string, string>) => void;
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
  filterValues: rawValues = EMPTY_VALUES,
  filterStorageKey,
  onFilterChange: onRawChange,
  onRefresh,
  onResetFilters,
  refreshing,
  searchLoading,
  toolbarRight,
}: ToolbarProps) {
  const textConfig = filters?.find((filter) => filter.type === "text-filters");
  const textValues = parseListTextFilters(rawValues.textFilters);
  const filterValues = {
    ...rawValues,
    ...Object.fromEntries(Object.entries(textValues).map(([key, value]) => [`text:${key}`, value])),
  };
  const expanded = useMemo(
    () =>
      filters?.flatMap((filter): ToolbarConditionConfig[] =>
        filter.type === "text-filters"
          ? Object.entries(listTextFields[filter.resource]).map(([key, label]) => ({
              key: `text:${key}`,
              label,
              placeholder: `搜索${label}`,
              type: "search",
            }))
          : [filter],
      ) ?? [],
    [filters],
  );
  const advanced = expanded.length > 2;
  const conditions = advanced ? expanded.filter((filter) => !isFixedFilter(filter)) : [];
  const directFilters = advanced ? expanded.filter(isFixedFilter) : expanded;
  const [selected, setSelected] = useFilterSelection(
    filterStorageKey ?? textConfig?.resource ?? "list",
    conditions.map((filter) => filter.key),
  );
  const activeFields = expanded.filter(
    (filter) =>
      !isFixedFilter(filter) &&
      Boolean(filterValues[filter.key]) &&
      filterValues[filter.key] !== filter.unfilteredValue,
  );
  const canClear = expanded.length ? activeFields.length > 0 : canResetFilters;
  function clearFilterValues() {
    if (advanced) {
      const selectedKeys = new Set(selected);
      const activeFilters = new Set(activeFields);
      const retainedKeys: string[] = [];
      for (const filter of conditions) {
        if (selectedKeys.has(filter.key) || activeFilters.has(filter)) {
          retainedKeys.push(filter.key);
        }
      }
      setSelected(retainedKeys);
    }
    const clearedEntries: [string, string][] = [];
    for (const filter of filters ?? []) {
      if (!isFixedFilter(filter)) {
        clearedEntries.push([
          filter.key,
          filter.type === "text-filters" ? "" : (filter.unfilteredValue ?? ""),
        ]);
      }
    }
    const clearedValues = Object.fromEntries(clearedEntries);
    onResetFilters?.(clearedValues);
  }
  function onFilterChange(key: string, value: string) {
    if (key.startsWith("text:")) {
      onRawChange?.(
        "textFilters",
        serializeListTextFilters({ ...textValues, [key.slice(5)]: value }),
      );
    } else {
      onRawChange?.(key, value);
    }
  }
  if (
    ![filters?.length, filtersExtra, toolbarRight, onRefresh, onResetFilters, bulkActionsSlot].some(
      Boolean,
    )
  ) {
    return null;
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" data-slot="data-grid-toolbar">
      {directFilters.length > 0 ? (
        <div
          className="flex w-full min-w-0 flex-wrap gap-3 sm:w-auto"
          data-slot="data-grid-toolbar-search"
        >
          {directFilters.map((filter) => {
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
            if (filter.type === "multi-select") {
              return (
                <SearchableMultiSelect
                  key={filter.key}
                  options={filter.options}
                  value={parseCsvParam(filterValues[filter.key] ?? "")}
                  onChange={(values) => onFilterChange(filter.key, values.join(","))}
                  placeholder={filter.label ?? filter.placeholder}
                  selectedPreviewLimit={filter.selectedPreviewLimit ?? 2}
                  modal={false}
                />
              );
            }
            if (filter.type === "date") {
              return (
                <Input
                  key={filter.key}
                  aria-label={filter.label ?? filter.placeholder}
                  type="date"
                  min={filter.min}
                  max={filter.max}
                  value={filterValues[filter.key] ?? ""}
                  onChange={(event) => {
                    if (event.currentTarget.validity.valid) {
                      onFilterChange(filter.key, event.target.value);
                    }
                  }}
                />
              );
            }
            if (filter.type === "custom") {
              return (
                <CustomFilterInput
                  key={filter.key}
                  config={filter}
                  value={filterValues[filter.key] ?? ""}
                  onChange={(value) => onFilterChange(filter.key, value)}
                />
              );
            }
            const control = (
              <SearchableSelect
                clearable={!isFixedFilter(filter)}
                disabled={filter.disabled}
                modal={false}
                onChange={(value) =>
                  onFilterChange(filter.key, value ?? filter.unfilteredValue ?? "")
                }
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
      ) : null}
      {conditions.length > 0 || filtersExtra ? (
        <div
          className="flex min-w-0 flex-wrap items-center gap-2"
          data-slot="data-grid-toolbar-filters"
        >
          {conditions.length > 0 ? (
            <FilterConditions
              configs={conditions}
              selected={selected}
              onSelectionChange={setSelected}
              onChange={onFilterChange}
              values={filterValues}
            />
          ) : null}
          {filtersExtra}
        </div>
      ) : null}
      <div
        className="flex min-w-0 flex-wrap items-center gap-2"
        data-slot="data-grid-toolbar-actions"
      >
        {onResetFilters ? (
          <Button disabled={!canClear} onClick={clearFilterValues} size="default" variant="outline">
            <IconFilterX data-icon="inline-start" />
            <span>清空筛选</span>
          </Button>
        ) : null}
        {onRefresh ? (
          <Button disabled={refreshing} onClick={onRefresh} size="default" variant="outline">
            <IconRefresh data-icon="inline-start" className={cn(refreshing && "animate-spin")} />
            <span>刷新</span>
          </Button>
        ) : null}
        {toolbarRight ? <div>{toolbarRight}</div> : null}
        {bulkActionsSlot}
      </div>
    </div>
  );
}
