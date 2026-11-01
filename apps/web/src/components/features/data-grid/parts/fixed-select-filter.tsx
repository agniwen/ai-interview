import { useMemo } from "react";
import { Filters, FiltersRow } from "@/components/reui/filters/filters";
import type { FilterQuery } from "@/components/reui/filters/filters-types";
import type { ToolbarConditionConfig, ToolbarFilterValue } from "./filter-config";
import { buildToolbarFilterField } from "./filter-conditions";
import { toolbarFilterLabels } from "./filter-labels";

export function FixedSelectFilter({
  config,
  value,
  onChange,
}: {
  config: Extract<ToolbarConditionConfig, { type: "select" }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const fields = useMemo(
    () => [buildToolbarFilterField({ ...config, unfilteredValue: undefined })],
    [config],
  );
  const query: FilterQuery<ToolbarFilterValue> = {
    combinator: "and",
    id: config.key,
    rules: [{ id: config.key, operator: "is", path: [config.key], type: "rule", value }],
    type: "group",
  };
  function validQuery(next: FilterQuery<ToolbarFilterValue>) {
    const [rule] = next.rules;
    return (
      next.rules.length === 1 &&
      rule?.type === "rule" &&
      rule.path.length === 1 &&
      rule.path[0] === config.key &&
      rule.operator === "is" &&
      config.options.some((option) => option.value === rule.value && !option.disabled)
    );
  }
  return (
    <Filters
      fields={fields}
      query={query}
      labels={toolbarFilterLabels}
      variant="basic"
      onBeforeQueryChange={validQuery}
      onQueryChange={(next) => {
        const [rule] = next.rules;
        if (!validQuery(next) || rule?.type !== "rule") {
          return;
        }
        const option = config.options.find((item) => item.value === rule.value);
        if (option) {
          onChange(option.value);
        }
      }}
    >
      <FiltersRow showBuilder={false} />
    </Filters>
  );
}
