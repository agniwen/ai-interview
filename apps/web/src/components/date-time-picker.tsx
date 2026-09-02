"use client";

import { IconCalendar, IconClock } from "@tabler/icons-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { WheelPicker, WheelPickerWrapper } from "@/components/wheel-picker";
import {
  formatDatePickerValue,
  formatDateTimePickerValue,
  parseDatePickerValue,
  parseDateTimePickerValue,
} from "@/lib/client/date-picker-value";
import { cn } from "@app/shared/utils";

const HOURS = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, "0"));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const HOUR_OPTIONS = HOURS.map((value) => ({ label: value, value }));

interface PickerProps {
  "aria-label"?: string;
  "aria-invalid"?: React.AriaAttributes["aria-invalid"];
  className?: string;
  disabled?: boolean;
  id?: string;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  placeholder?: string;
  required?: boolean;
  value: string;
}

interface DatePickerProps extends PickerProps {
  onValueChange: (value: string) => void;
}

interface DateTimePickerProps extends PickerProps {
  defaultTime?: `${number}:${number}`;
  minuteStep?: number;
  onValueChange: (value: string) => void;
}

type PickerTriggerProps = Omit<React.ComponentProps<typeof Button>, "children"> & {
  displayValue?: string;
  icon: typeof IconCalendar;
  placeholder?: string;
  required?: boolean;
};

function PickerTrigger({
  className,
  displayValue,
  icon: Icon,
  placeholder,
  required,
  ...buttonProps
}: PickerTriggerProps) {
  return (
    <Button
      {...buttonProps}
      aria-required={required}
      className={cn(
        "w-full justify-between overflow-hidden font-normal",
        !displayValue && "text-muted-foreground",
        className,
      )}
      type="button"
      variant="outline"
    >
      <span className="truncate">{displayValue ?? placeholder}</span>
      <Icon aria-hidden="true" data-icon="inline-end" />
    </Button>
  );
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
          <PickerTrigger
            {...triggerProps}
            className={className}
            disabled={disabled}
            displayValue={displayValue}
            icon={IconCalendar}
            placeholder={placeholder}
          />
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

function getMinuteOptions(step: number, selectedMinute: string | undefined): string[] {
  const normalizedStep = Number.isInteger(step) && step > 0 && step <= 60 ? step : 1;
  if (normalizedStep === 1) {
    return MINUTES;
  }

  const minutes = MINUTES.filter((_, index) => index % normalizedStep === 0);
  if (selectedMinute && !minutes.includes(selectedMinute)) {
    return [...minutes, selectedMinute].toSorted((left, right) => Number(left) - Number(right));
  }
  return minutes;
}

export function DateTimePicker({
  className,
  defaultTime,
  disabled,
  minuteStep = 1,
  onValueChange,
  placeholder = "选择日期和时间",
  value,
  ...triggerProps
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selected = parseDateTimePickerValue(value);
  const [draft, setDraft] = React.useState<Date | undefined>(selected);
  const hour = draft ? String(draft.getHours()).padStart(2, "0") : undefined;
  const minute = draft ? String(draft.getMinutes()).padStart(2, "0") : undefined;
  const minuteOptions = React.useMemo(
    () => getMinuteOptions(minuteStep, minute).map((option) => ({ label: option, value: option })),
    [minuteStep, minute],
  );
  const displayValue = selected
    ? format(selected, "yyyy年M月d日 HH:mm", { locale: zhCN })
    : undefined;

  function getDefaultDateTime() {
    const now = new Date();
    if (defaultTime) {
      const [hours = 0, minutes = 0] = defaultTime.split(":").map(Number);
      now.setHours(hours, minutes);
    }
    now.setSeconds(0, 0);
    return now;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      setDraft(parseDateTimePickerValue(value) ?? getDefaultDateTime());
    }
    setOpen(nextOpen);
  }

  function updateDate(date: Date | undefined) {
    if (!date) {
      setDraft(undefined);
      return;
    }

    const time = draft ?? getDefaultDateTime();
    const nextValue = new Date(date);
    nextValue.setHours(time.getHours(), time.getMinutes(), 0, 0);
    setDraft(nextValue);
  }

  function updateTime(nextHour: string, nextMinute: string) {
    if (!draft) {
      return;
    }
    const nextValue = new Date(draft);
    nextValue.setHours(Number(nextHour), Number(nextMinute), 0, 0);
    setDraft(nextValue);
  }

  return (
    <Popover onOpenChange={handleOpenChange} open={open}>
      <PopoverTrigger
        render={
          <PickerTrigger
            {...triggerProps}
            className={className}
            disabled={disabled}
            displayValue={displayValue}
            icon={IconClock}
            placeholder={placeholder}
          />
        }
      />
      <PopoverContent
        align="start"
        className="w-auto max-w-[calc(100vw-2rem)] overflow-hidden bg-background p-0"
      >
        <div className="flex flex-col min-[480px]:flex-row">
          <Calendar
            autoFocus
            defaultMonth={draft}
            locale={zhCN}
            mode="single"
            onSelect={updateDate}
            selected={draft}
          />
          <div className="flex flex-col justify-center gap-2 border-t p-3 min-[480px]:w-44 min-[480px]:border-t-0 min-[480px]:border-l">
            <div
              aria-hidden="true"
              className="grid grid-cols-2 gap-2 text-center text-xs text-muted-foreground"
            >
              <span>时</span>
              <span>分</span>
            </div>
            <div className={cn(!draft && "opacity-40")} inert={!draft}>
              <WheelPickerWrapper className="gap-2">
                <WheelPicker
                  aria-label="小时"
                  infinite
                  onValueChange={(nextHour) => updateTime(nextHour, minute ?? "00")}
                  options={HOUR_OPTIONS}
                  value={hour ?? "00"}
                  visibleCount={16}
                />
                <WheelPicker
                  aria-label="分钟"
                  infinite
                  onValueChange={(nextMinute) => updateTime(hour ?? "00", nextMinute)}
                  options={minuteOptions}
                  value={minute ?? "00"}
                  visibleCount={16}
                />
              </WheelPickerWrapper>
            </div>
          </div>
        </div>
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
                onValueChange(draft ? formatDateTimePickerValue(draft) : "");
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
