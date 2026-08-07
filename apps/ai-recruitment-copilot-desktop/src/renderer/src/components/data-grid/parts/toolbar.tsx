import type { CSSProperties, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DebouncedSearchInput } from "./debounced-search-input";

// =====================================================================
// DataGrid 工具栏过滤器：支持搜索框、单选下拉、多选下拉。
// 多选下拉 (`multi-select`) 在 state/URL 层用 CSV 字符串编码（"a,b,c"），
// 与现有 `Record<string, string>` 的 filter state 兼容；空字符串表示未筛选。
// / Multi-select filters serialize to a CSV string (`"a,b,c"`) so they fit
// the existing Record<string,string> filter state and URL params. An empty
// string means "no filter applied".
// =====================================================================

export type ToolbarFilterConfig =
  | { type: "search"; key: string; placeholder?: string; minWidth?: string }
  | {
      type: "select";
      key: string;
      placeholder?: string;
      options: SearchableSelectOption[];
      searchPlaceholder?: string;
      emptyMessage?: string;
      clearable?: boolean;
      disabled?: boolean;
      disabledReason?: string;
      required?: boolean;
    }
  | {
      type: "multi-select";
      key: string;
      placeholder?: string;
      options: SearchableSelectOption[];
      searchPlaceholder?: string;
      emptyMessage?: string;
      selectedFormat?: (count: number) => string;
      selectedPreviewLimit?: number;
    };

export interface ToolbarProps {
  filters?: ToolbarFilterConfig[];
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  searchLoading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** 重置所有过滤器（含搜索）到初始默认值 / Reset every filter (incl. search) to defaults. */
  onResetFilters?: () => void;
  /** 当前是否有非默认筛选条件，用于驱动重置按钮的 disabled 态。 */
  /** Whether any filter currently deviates from defaults. Drives reset button disabled state. */
  canResetFilters?: boolean;
  toolbarRight?: ReactNode;
  /**
   * 渲染在配置式 filters 之后、仍位于左侧 filter 区的额外节点。
   * 用于把页面级的自定义筛选器（如归档下拉）和搜索/多选放在一起，
   * 而不是混进右侧按钮区。
   * Extra node rendered after the configured filters, still inside the
   * left-side filter region. Lets pages drop in custom filters (e.g. an
   * archived dropdown) next to the search/multi-selects instead of mixing
   * them with action buttons on the right.
   */
  filtersExtra?: ReactNode;
  bulkActionsSlot?: ReactNode;
}

type FilterItemStyle = CSSProperties & {
  "--data-grid-filter-min-width"?: string;
};

function getFilterItemStyle(minWidth?: string): FilterItemStyle | undefined {
  return minWidth ? { "--data-grid-filter-min-width": minWidth } : undefined;
}

function csvToArray(value: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function arrayToCsv(value: string[]): string {
  return value.join(",");
}

export function Toolbar(props: ToolbarProps) {
  const {
    bulkActionsSlot,
    canResetFilters,
    filterValues,
    filters,
    filtersExtra,
    onFilterChange,
    onRefresh,
    onResetFilters,
    refreshing,
    searchLoading,
    toolbarRight,
  } = props;

  const hasFilters = filters && filters.length > 0;
  const hasFiltersExtra = Boolean(filtersExtra);
  if (
    !(hasFilters || hasFiltersExtra) &&
    !toolbarRight &&
    !onRefresh &&
    !onResetFilters &&
    !bulkActionsSlot
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-start gap-3" data-slot="data-grid-toolbar">
      {hasFilters || hasFiltersExtra ? (
        <div
          className="grid w-full min-w-0 grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center"
          data-slot="data-grid-toolbar-filters"
        >
          {filters?.map((filter) => {
            const value = filterValues?.[filter.key] ?? "";
            if (filter.type === "search") {
              return (
                <DebouncedSearchInput
                  className="relative min-w-0 sm:min-w-(--data-grid-filter-min-width)"
                  key={filter.key}
                  loading={searchLoading}
                  onValueChange={(next) => onFilterChange?.(filter.key, next)}
                  placeholder={filter.placeholder}
                  style={getFilterItemStyle(filter.minWidth)}
                  value={value}
                />
              );
            }
            if (filter.type === "select") {
              const selectControl = (
                <SearchableSelect
                  clearable={filter.clearable ?? true}
                  disabled={filter.disabled}
                  emptyMessage={filter.emptyMessage ?? "没有匹配项"}
                  onChange={(next) => onFilterChange?.(filter.key, next ?? "")}
                  options={filter.options}
                  placeholder={filter.placeholder ?? "请选择"}
                  required={filter.required}
                  searchPlaceholder={filter.searchPlaceholder ?? "搜索…"}
                  value={value || null}
                />
              );
              if (filter.disabled && filter.disabledReason) {
                return (
                  <Tooltip key={filter.key}>
                    <TooltipTrigger
                      render={
                        // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- disabled controls cannot receive focus; the wrapper exposes the reason to keyboard users.
                        <span className="min-w-0 sm:w-auto sm:min-w-45" tabIndex={0}>
                          {selectControl}
                        </span>
                      }
                    />
                    <TooltipContent>{filter.disabledReason}</TooltipContent>
                  </Tooltip>
                );
              }
              return (
                <div className="min-w-0 sm:w-auto sm:min-w-45" key={filter.key}>
                  {selectControl}
                </div>
              );
            }
            // multi-select
            return (
              <div className="min-w-0 sm:w-auto sm:min-w-45" key={filter.key}>
                <SearchableMultiSelect
                  emptyMessage={filter.emptyMessage ?? "没有匹配项"}
                  onChange={(next) => onFilterChange?.(filter.key, arrayToCsv(next))}
                  options={filter.options}
                  placeholder={filter.placeholder ?? "请选择"}
                  searchPlaceholder={filter.searchPlaceholder ?? "搜索…"}
                  selectedFormat={filter.selectedFormat ?? ((count) => `已选 ${count} 项`)}
                  selectedPreviewLimit={filter.selectedPreviewLimit ?? 2}
                  showBadges={false}
                  value={csvToArray(value)}
                />
              </div>
            );
          })}
          {filtersExtra ? (
            <div className="min-w-0 [&>button]:w-full sm:w-auto sm:[&>button]:w-auto">
              {filtersExtra}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="flex min-w-fit shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap"
        data-slot="data-grid-toolbar-actions"
      >
        {onRefresh ? (
          <Button
            className="shrink-0"
            disabled={refreshing}
            onClick={onRefresh}
            size="icon"
            variant="outline"
          >
            <Icon
              className={refreshing ? "size-4 animate-spin" : "size-4"}
              icon="ph:arrows-clockwise"
            />
            <span className="sr-only">刷新</span>
          </Button>
        ) : null}
        {onResetFilters ? (
          <Button
            className="shrink-0"
            disabled={!canResetFilters}
            onClick={onResetFilters}
            size="icon"
            variant="outline"
          >
            <Icon className="size-4" icon="ph:funnel-simple-x" />
            <span className="sr-only">重置筛选</span>
          </Button>
        ) : null}
        {toolbarRight ? <div>{toolbarRight}</div> : null}
        {bulkActionsSlot}
      </div>
    </div>
  );
}
