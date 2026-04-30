"use client";

/**
 * 桌面端多选下拉：用 Popover + 内嵌列表实现，触发器外观与 `<SelectTrigger>` 一致，
 * 让多选与单选在同一页面里视觉对齐。
 *
 * Desktop multi-select rendered in a Popover with the same trigger styling as
 * `<SelectTrigger>`, so multi-select and single-select line up visually.
 */

import type { CandidateFormTemplateSnapshot } from "@/lib/candidate-forms";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { AnswerValue } from "./types";

export function DesktopMultiSelect({
  question,
  value,
  onChange,
  invalid,
  inputId,
}: {
  question: CandidateFormTemplateSnapshot["questions"][number];
  value: AnswerValue;
  onChange: (next: AnswerValue) => void;
  invalid?: boolean;
  inputId: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(Array.isArray(value) ? value : []), [value]);

  const triggerLabel = useMemo(() => {
    if (selected.size === 0) {
      return "请选择";
    }
    return question.options
      .filter((option) => selected.has(option.value))
      .map((option) => option.label)
      .join("、");
  }, [question.options, selected]);

  function toggle(optionValue: string) {
    const next = new Set(selected);
    if (next.has(optionValue)) {
      next.delete(optionValue);
    } else {
      next.add(optionValue);
    }
    onChange([...next]);
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow]",
            "data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20",
            "focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50",
          )}
          data-invalid={invalid ? true : undefined}
          id={inputId}
          type="button"
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              selected.size === 0 ? "text-muted-foreground" : "",
            )}
          >
            {triggerLabel}
          </span>
          <ChevronDownIcon className="size-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-56 p-1"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <p className="px-2 pt-1 pb-1.5 text-muted-foreground text-xs">可多选</p>
        <div className="max-h-64 overflow-y-auto">
          {question.options.map((option) => {
            const checked = selected.has(option.value);
            return (
              <button
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  checked ? "bg-accent/50" : "",
                )}
                key={option.value}
                onClick={() => toggle(option.value)}
                type="button"
              >
                <CheckIcon
                  className={cn(
                    "size-4 shrink-0 text-primary",
                    checked ? "opacity-100" : "opacity-0",
                  )}
                />
                <span className="flex-1">{option.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
