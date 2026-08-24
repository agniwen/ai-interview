"use client";

import { IconCalendar } from "@tabler/icons-react";
import { zhCN } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { resumePoolCreatedAtBounds, resumePoolCreatedAtRangeLabel } from "./resume-pool-page-model";

const QUICK_RANGES = [
  { label: "不限", value: "" },
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

export function ResumePoolCreatedAtFilter({
  onValueChange,
  value,
}: {
  onValueChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange>();

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      const bounds = resumePoolCreatedAtBounds(value);
      setDraft(
        bounds
          ? { from: dateFromCalendarKey(bounds.from), to: dateFromCalendarKey(bounds.to) }
          : undefined,
      );
    }
    setOpen(nextOpen);
  }

  function applyQuickRange(nextValue: string) {
    onValueChange(nextValue);
    setOpen(false);
  }

  function applyCustomRange() {
    if (!draft?.from || !draft.to) {
      return;
    }
    onValueChange(`custom:${calendarKey(draft.from)}:${calendarKey(draft.to)}`);
    setOpen(false);
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={`加入时间：${resumePoolCreatedAtRangeLabel(value)}`}
            variant="outline"
          >
            <IconCalendar className="size-4" />
            {resumePoolCreatedAtRangeLabel(value)}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto p-0">
        <div className="flex flex-col gap-1 p-2">
          {QUICK_RANGES.map((option) => (
            <Button
              className="justify-start"
              key={option.value || "all"}
              onClick={() => applyQuickRange(option.value)}
              size="sm"
              type="button"
              variant={value === option.value ? "secondary" : "ghost"}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Separator />
        <Calendar
          locale={zhCN}
          mode="range"
          numberOfMonths={2}
          onSelect={setDraft}
          selected={draft}
        />
        <div className="flex justify-end gap-2 border-t p-2">
          <Button onClick={() => setOpen(false)} size="sm" type="button" variant="ghost">
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
      </PopoverContent>
    </Popover>
  );
}
