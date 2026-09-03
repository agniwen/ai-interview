import { useMemo, useState } from "react";
import { Filters } from "@/components/reui/filters/filters";
import type { FilterField, FilterQuery } from "@/components/reui/filters/filters-types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getToolbarFilterOperator } from "./filter-config";
import type { ToolbarConditionConfig, ToolbarFilterValue } from "./filter-config";
import { ToolbarDateEditor } from "./filter-date-editor";
import { toolbarFilterLabels } from "./filter-labels";
import { buildToolbarFilterQuery, toolbarFilterChanges } from "./filter-query";

function buildField(
  config: ToolbarConditionConfig,
  active: boolean,
): FilterField<ToolbarFilterValue> {
  const operator = getToolbarFilterOperator(config);
  const field: FilterField<ToolbarFilterValue> = {
    defaultOperator: operator.value,
    disabled: active,
    id: config.key,
    label: config.label ?? config.placeholder ?? config.key,
    operators: [operator],
  };
  if (config.type === "search") {
    return { ...field, placeholder: config.placeholder, type: "text" };
  }
  if (config.type === "custom") {
    return {
      ...field,
      editor: config.editor,
      renderValue: ({ value }) => config.formatValue(Array.isArray(value) ? "" : (value ?? "")),
      valueText: ({ value }) => config.formatValue(Array.isArray(value) ? "" : (value ?? "")),
    };
  }
  if (config.type === "date") {
    return {
      ...field,
      editor: ToolbarDateEditor,
      validate: ({ value }) => {
        if (!value || Array.isArray(value)) {
          return "请选择日期";
        }
        if (config.min && value < config.min) {
          return `不能早于 ${config.min}`;
        }
        if (config.max && value > config.max) {
          return `不能晚于 ${config.max}`;
        }
        return null;
      },
    };
  }
  const options = config.options.filter(
    (option) => option.value && option.value !== config.unfilteredValue,
  );
  return {
    ...field,
    options: options.map((option) => ({
      description: option.description,
      disabled: option.disabled,
      icon:
        option.avatarUrl === undefined ? undefined : (
          <Avatar label={option.label} seed={`filter:${option.value}`} size="sm">
            {option.avatarUrl ? <AvatarImage alt={option.label} src={option.avatarUrl} /> : null}
            <AvatarFallback>{option.label.slice(0, 1)}</AvatarFallback>
          </Avatar>
        ),
      keywords: option.searchValue ? [option.searchValue] : undefined,
      label: option.label,
      value: option.value,
    })),
    placeholder: config.searchPlaceholder,
    renderValue: ({ values, labels: displayLabels }) => {
      if (values.length === 0) {
        return displayLabels.selectPlaceholder;
      }
      const limit = config.type === "multi-select" ? (config.selectedPreviewLimit ?? 2) : 1;
      const labels = values.map(
        (value) => options.find((option) => option.value === value)?.label ?? String(value),
      );
      return (
        <span className="min-w-0 max-w-64 truncate" title={labels.join("、")}>
          {labels.slice(0, limit).join("、")}
          {labels.length > limit ? ` +${labels.length - limit}` : ""}
        </span>
      );
    },
    type: config.type === "multi-select" ? "multiselect" : "select",
  };
}

export function FilterConditions({
  configs,
  selected,
  onSelectionChange,
  values,
  onChange,
}: {
  configs: ToolbarConditionConfig[];
  selected: string[];
  onSelectionChange: (keys: string[]) => void;
  values: Record<string, string>;
  onChange?: (key: string, value: string) => void;
}) {
  const signature = JSON.stringify([
    selected,
    configs.map((config) => [config.key, values[config.key] ?? ""]),
  ]);
  const [state, setState] = useState(() => ({
    query: buildToolbarFilterQuery(configs, values, {}, selected),
    signature,
  }));
  let { query } = state;
  if (state.signature !== signature) {
    const ids = Object.fromEntries(
      state.query.rules
        .filter((rule) => rule.type === "rule")
        .map((rule) => [rule.path[0], rule.id]),
    );
    query = buildToolbarFilterQuery(configs, values, ids, selected);
    setState({ query, signature });
  }
  const fields = useMemo(
    () =>
      configs.map((config) =>
        buildField(
          config,
          query.rules.some((rule) => rule.type === "rule" && rule.path[0] === config.key),
        ),
      ),
    [configs, query],
  );

  function applyQuery(next: FilterQuery<ToolbarFilterValue>) {
    const changes = toolbarFilterChanges(next, configs, values);
    if (!changes) {
      return;
    }
    const nextSelected = next.rules.flatMap((rule) => (rule.type === "rule" ? [rule.path[0]] : []));
    onSelectionChange(nextSelected);
    setState({
      query: next,
      signature: JSON.stringify([
        nextSelected,
        configs.map((config) => [config.key, values[config.key] ?? ""]),
      ]),
    });
    for (const [key, value] of Object.entries(changes)) {
      onChange?.(key, value);
    }
  }

  return (
    <Filters<ToolbarFilterValue>
      className="min-w-0 max-w-full"
      fields={fields}
      labels={toolbarFilterLabels}
      query={query}
      onQueryChange={applyQuery}
      onBeforeQueryChange={(next) => toolbarFilterChanges(next, configs, values) !== null}
      variant="basic"
    />
  );
}
