import type { FilterEditor, FilterOperator } from "@/components/reui/filters/filters-types";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";

export type ToolbarFilterValue = string | string[];

interface FilterConfigBase {
  key: string;
  label?: string;
  placeholder?: string;
  /** The resource's explicit unrestricted value; it is never a selectable condition. */
  unfilteredValue?: string;
}

export type ToolbarFilterConfig =
  | { type: "search"; key: string; placeholder?: string; minWidth?: string }
  | (FilterConfigBase & {
      type: "custom";
      editor: FilterEditor<ToolbarFilterValue>;
      formatValue: (value: string) => string;
      operator?: FilterOperator;
    })
  | (FilterConfigBase & {
      type: "date";
      boundary: "from" | "to";
      min?: string;
      max?: string;
    })
  | (FilterConfigBase & {
      type: "select";
      options: SearchableSelectOption[];
      searchPlaceholder?: string;
      emptyMessage?: string;
      clearable?: boolean;
      disabled?: boolean;
      disabledReason?: string;
      required?: boolean;
    })
  | (FilterConfigBase & {
      type: "multi-select";
      options: SearchableSelectOption[];
      match?: "any" | "all";
      searchPlaceholder?: string;
      emptyMessage?: string;
      selectedFormat?: (count: number) => string;
      selectedPreviewLimit?: number;
    });

export type ToolbarConditionConfig = Exclude<ToolbarFilterConfig, { type: "search" }>;

export function getToolbarFilterOperator(config: ToolbarConditionConfig): FilterOperator {
  if (config.type === "multi-select") {
    return config.match === "all"
      ? { arity: "many", label: "同时具备", value: "has_all_of" }
      : { arity: "many", label: "属于任意", value: "is_any_of" };
  }
  if (config.type === "date") {
    return config.boundary === "from"
      ? { label: "不早于", value: "gte" }
      : { label: "不晚于", value: "lte" };
  }
  if (config.type === "custom" && config.operator) {
    return config.operator;
  }
  return { label: "是", value: "is" };
}

export function isToolbarCondition(config: ToolbarFilterConfig): config is ToolbarConditionConfig {
  return config.type !== "search";
}
