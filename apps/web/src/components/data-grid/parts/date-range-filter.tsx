"use client";

import type { FilterEditorProps } from "@/components/reui/filters/filters-types";
import type { ToolbarFilterValue } from "@/components/data-grid/parts/filter-config";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { dateRangeFilterBounds } from "@arc/shared/date-range-filter";

const QUICK_RANGES = [
  { label: "今天", value: "today" },
  { label: "昨天", value: "yesterday" },
  { label: "最近 7 天", value: "last_7_days" },
] as const;

function dateFromCalendarKey(value: string): Date {
  return new Date(`${value}T12:00:00`);
}

function calendarKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function DateRangeFilterEditor({
  cancel,
  commit,
  value,
  autoFocusProps,
}: FilterEditorProps<ToolbarFilterValue>) {
  const current = Array.isArray(value) ? "" : (value ?? "");
  const [draft, setDraft] = useState<DateRange | undefined>(() => {
    const bounds = dateRangeFilterBounds(current);
    return bounds
      ? { from: dateFromCalendarKey(bounds.from), to: dateFromCalendarKey(bounds.to) }
      : undefined;
  });

  function applyCustomRange() {
    if (!draft?.from || !draft.to) {
      return;
    }
    commit(`custom:${calendarKey(draft.from)}:${calendarKey(draft.to)}`);
  }

  return (
    <div className="w-auto">
      <div className="flex flex-col gap-1 p-2">
        {QUICK_RANGES.map((option, index) => (
          <Button
            {...(index === 0 ? autoFocusProps : undefined)}
            className="justify-start"
            key={option.value || "all"}
            onClick={() => {
              const bounds = dateRangeFilterBounds(option.value);
              if (bounds) {
                commit(`custom:${bounds.from}:${bounds.to}`);
              }
            }}
            size="sm"
            type="button"
            variant={current === option.value ? "secondary" : "ghost"}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <Separator />
      <Calendar
        defaultMonth={draft?.from}
        locale={zhCN}
        mode="range"
        numberOfMonths={1}
        onSelect={setDraft}
        selected={draft}
      />
      <Separator />
      <div className="flex justify-end gap-2 p-2">
        <Button onClick={cancel} size="sm" type="button" variant="ghost">
          取消
        </Button>
        <Button
          disabled={!draft?.from || !draft.to}
          onClick={applyCustomRange}
          size="sm"
          type="button"
        >
          应用自定义范围
        </Button>
      </div>
    </div>
  );
}
