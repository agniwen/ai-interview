import type { FilterEditorProps } from "@/components/reui/filters/filters-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ToolbarFilterValue } from "./filter-config";

export function ToolbarDateEditor(props: FilterEditorProps<ToolbarFilterValue>) {
  const { autoFocusProps, cancel, commit, field, labels, onValueChange, operator, value } = props;
  const date = Array.isArray(value) ? "" : (value ?? "");
  const error = field.validate?.({
    arity: "one",
    field,
    labels,
    operator,
    rule: { id: field.id, operator: operator.value, path: [field.id], type: "rule", value: date },
    value: date,
    values: [date],
  });
  return (
    <div className="flex flex-col gap-3 p-3">
      <Input
        {...autoFocusProps}
        aria-label={field.label}
        aria-invalid={Boolean(error)}
        type="date"
        value={date}
        onChange={(event) => onValueChange(event.target.value)}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button onClick={cancel} size="sm" variant="ghost">
          取消
        </Button>
        <Button disabled={!date || Boolean(error)} onClick={() => commit(date)} size="sm">
          应用
        </Button>
      </div>
    </div>
  );
}
