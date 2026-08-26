import { useState } from "react";
import { resolveFilterLabels } from "@/components/reui/filters/filters-i18n";
import type { FilterOptionsState } from "@/components/reui/filters/filters-types";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getToolbarFilterOperator } from "./filter-config";
import type { ToolbarFilterConfig, ToolbarFilterValue } from "./filter-config";
import { toolbarFilterLabels } from "./filter-labels";

const labels = resolveFilterLabels(toolbarFilterLabels);
const options: FilterOptionsState = {
  error: false,
  hasMore: false,
  items: [],
  loadMore() {
    /* Custom editors have no async options. */
  },
  loading: false,
  query: "",
  resolve(): undefined {
    /* Custom editors have no options to resolve. */
  },
  retry() {
    /* Custom editors have no option requests to retry. */
  },
  setQuery() {
    /* Custom editors manage their own input. */
  },
};

/** A permanently visible custom input for lists with only one or two fields. */
export function CustomFilterInput({
  config,
  value,
  onChange,
}: {
  config: Extract<ToolbarFilterConfig, { type: "custom" }>;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ToolbarFilterValue | undefined>(value);
  const Editor = config.editor;
  const operator = getToolbarFilterOperator(config);
  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setDraft(value);
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger render={<Button variant="outline" />}>
        {value ? config.formatValue(value) : (config.label ?? config.placeholder)}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0">
        <Editor
          autoFocusProps={{
            autoFocus: true,
            ref: (element) => {
              element?.focus();
            },
          }}
          back={() => setOpen(false)}
          cancel={() => setOpen(false)}
          commit={(next = draft) => {
            if (!Array.isArray(next)) {
              onChange(next ?? "");
              setOpen(false);
            }
          }}
          field={{ id: config.key, label: config.label ?? config.placeholder ?? config.key }}
          host="amend"
          labels={labels}
          onValueChange={setDraft}
          operator={operator}
          options={options}
          value={draft}
        />
      </PopoverContent>
    </Popover>
  );
}
