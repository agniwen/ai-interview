"use client";

import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Icon } from "@/components/ui/icon";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { formatDatePickerValue, parseDatePickerValue } from "@/lib/client/date-picker-value";
import { cn } from "@app/shared/utils";

interface DatePickerProps {
  "aria-label"?: string;
  className?: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  placeholder?: string;
  value: string;
}

export function DatePicker({
  className,
  disabled,
  onValueChange,
  placeholder = "选择日期",
  value,
  ...triggerProps
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDatePickerValue(value);
  const [draft, setDraft] = React.useState<Date | undefined>(selected);
  const displayValue = selected ? format(selected, "yyyy年M月d日", { locale: zhCN }) : undefined;

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraft(parseDatePickerValue(value));
    }
    setOpen(nextOpen);
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        render={
          <Button
            {...triggerProps}
            className={cn(
              "justify-between overflow-hidden font-normal",
              !displayValue && "text-muted-foreground",
              className,
            )}
            disabled={disabled}
            type="button"
            variant="outline"
          >
            <span className="truncate">{displayValue ?? placeholder}</span>
            <Icon data-icon="inline-end" icon="ph:calendar-blank" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-auto overflow-hidden bg-background p-0">
        <Calendar autoFocus locale={zhCN} mode="single" onSelect={setDraft} selected={draft} />
        <Separator />
        <div className="flex justify-between gap-2 p-2">
          <Button
            disabled={!draft}
            onClick={() => setDraft(undefined)}
            size="sm"
            type="button"
            variant="ghost"
          >
            清除
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => setOpen(false)} size="sm" type="button" variant="ghost">
              取消
            </Button>
            <Button
              onClick={() => {
                onValueChange(draft ? formatDatePickerValue(draft) : "");
                setOpen(false);
              }}
              size="sm"
              type="button"
            >
              确定
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
