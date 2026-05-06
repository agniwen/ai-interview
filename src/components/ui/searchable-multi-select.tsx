"use client";

import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import { cn } from "@/lib/utils";

// =====================================================================
// 多选可搜索下拉。Trigger 显示"已选 N ..."文案，触发器下方默认渲染已选项 badge 列表。
// Multi-pick searchable selector. Trigger shows "已选 N ..." copy, with the
// selected items rendered as removable badges below by default.
// =====================================================================

export interface SearchableMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: SearchableSelectOption[];
  /** 触发器空状态文案 / Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** 已选个数文案，例如 count => `已选 ${count} 位面试官`。 */
  /** Format the selected-count copy in the trigger. */
  selectedFormat?: (count: number) => string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** 是否在触发器下方显示已选项 badge 列表 / Show selected badges below trigger. */
  showBadges?: boolean;
  triggerClassName?: string;
  id?: string;
}

export function SearchableMultiSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  selectedFormat = (count) => `已选 ${count} 项`,
  searchPlaceholder = "搜索...",
  emptyMessage = "没有匹配项",
  invalid,
  disabled,
  showBadges = true,
  triggerClassName,
  id,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedItems = useMemo(
    () => options.filter((item) => selectedSet.has(item.value)),
    [options, selectedSet],
  );

  const toggle = (next: string) => {
    if (selectedSet.has(next)) {
      onChange(value.filter((v) => v !== next));
    } else {
      onChange([...value, next]);
    }
  };

  const remove = (next: string) => {
    onChange(value.filter((v) => v !== next));
  };

  return (
    // flex flex-col gap-2：position:fixed 的 popover wrapper 不参与 flex 布局，
    // 避免 space-y-* 在 popover 内联渲染时引发 trigger margin 抖动。
    // / flex+gap because position:fixed children (the inline popover wrapper)
    // are excluded from flex layout, sidestepping the space-y-* jitter.
    <div className="flex flex-col gap-2">
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger asChild>
          <button
            aria-expanded={open}
            aria-invalid={invalid ? true : undefined}
            className={cn(
              "flex h-10 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-left text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
              triggerClassName,
            )}
            data-invalid={invalid ? true : undefined}
            disabled={disabled}
            id={triggerId}
            type="button"
          >
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                selectedItems.length === 0 ? "text-muted-foreground" : "",
              )}
            >
              {selectedItems.length === 0 ? placeholder : selectedFormat(selectedItems.length)}
            </span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-(--radix-popover-trigger-width) min-w-72 p-0"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyMessage}</CommandEmpty>
              <CommandGroup>
                {options.map((option) => {
                  const isSelected = selectedSet.has(option.value);
                  return (
                    <CommandItem
                      disabled={option.disabled}
                      key={option.value}
                      onSelect={() => toggle(option.value)}
                      value={option.searchValue ?? `${option.label} ${option.description ?? ""}`}
                    >
                      <CheckIcon
                        className={cn("size-4", isSelected ? "opacity-100" : "opacity-0")}
                      />
                      <div className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate">{option.label}</span>
                        {option.description ? (
                          <span className="truncate text-muted-foreground text-xs">
                            {option.description}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {showBadges && selectedItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedItems.map((item) => (
            <Badge className="gap-1 pr-0.5" key={item.value} variant="secondary">
              {item.label}
              <button
                aria-label={`移除 ${item.label}`}
                className="inline-flex size-4 items-center justify-center rounded-sm opacity-60 hover:bg-background/70 hover:opacity-100"
                disabled={disabled}
                onClick={() => remove(item.value)}
                type="button"
              >
                <XIcon className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
