import type { FilterQuery, FilterRule } from "@/components/reui/filters/filters-types";
import { parseCsvParam } from "@arc/shared/csv";
import { getToolbarFilterOperator } from "./filter-config";
import type { ToolbarConditionConfig, ToolbarFilterValue } from "./filter-config";

/** UI rule ids are deliberately absent from URL state, RPC parameters and query keys. */
export function buildToolbarFilterQuery(
  configs: ToolbarConditionConfig[],
  values: Record<string, string>,
  ids: Record<string, string> = {},
): FilterQuery<ToolbarFilterValue> {
  const rules: FilterRule<ToolbarFilterValue>[] = [];
  for (const config of configs) {
    const value = values[config.key] ?? "";
    if (!value || value === config.unfilteredValue) {
      continue;
    }
    rules.push({
      id: ids[config.key] ?? config.key,
      operator: getToolbarFilterOperator(config).value,
      path: [config.key],
      type: "rule",
      value: config.type === "multi-select" ? parseCsvParam(value) : value,
    });
  }
  return { combinator: "and", id: "filters", rules, type: "group" };
}

function serializeRuleValue(
  config: ToolbarConditionConfig,
  value: ToolbarFilterValue,
): string | null {
  if (config.type === "multi-select") {
    return Array.isArray(value) ? [...new Set(value)].toSorted().join(",") : null;
  }
  return Array.isArray(value) ? null : value;
}

/** Only the operators the resource already supports can cross the UI boundary. */
export function toolbarFilterChanges(
  query: FilterQuery<ToolbarFilterValue>,
  configs: ToolbarConditionConfig[],
  currentValues: Record<string, string>,
): Record<string, string> | null {
  if (query.combinator !== "and") {
    return null;
  }
  const values = new Map<string, string>();
  for (const rule of query.rules) {
    if (rule.type !== "rule" || rule.negated || rule.path.length !== 1) {
      return null;
    }
    const [key] = rule.path;
    const config = configs.find((item) => item.key === key);
    if (
      !config ||
      values.has(key) ||
      (rule.operator && rule.operator !== getToolbarFilterOperator(config).value)
    ) {
      return null;
    }
    if (!rule.operator || rule.value === undefined) {
      values.set(key, currentValues[key] ?? "");
      continue;
    }
    const serialized = serializeRuleValue(config, rule.value);
    if (serialized === null) {
      return null;
    }
    values.set(key, serialized);
  }
  const changes: Record<string, string> = {};
  for (const config of configs) {
    const next = values.get(config.key) || config.unfilteredValue || "";
    const previous = currentValues[config.key] ?? "";
    const normalizedPrevious =
      config.type === "multi-select"
        ? [...new Set(parseCsvParam(previous))].toSorted().join(",")
        : previous;
    if (next !== normalizedPrevious) {
      changes[config.key] = next;
    }
  }
  return changes;
}
