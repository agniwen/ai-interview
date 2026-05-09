"use client";

import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { useId, useMemo, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/shared/utils";

// =====================================================================
// 单选可搜索下拉。底层是 Command + Popover，沿用项目已修好的 popover/cmdk 滚动方案。
// Single-pick searchable selector. Built on the project's Command + Popover
// stack (already patched for scroll-inside-dialog).
// =====================================================================

export interface SearchableSelectOption {
  /** 唯一标识，提交给 onChange / Discriminator value passed to onChange. */
  value: string;
  /** 主显示文本 / Primary label rendered in trigger and option row. */
  label: string;
  /** 副信息（如部门 / 备注），出现在 option 第二行；为空则不显示。 */
  /** Secondary line shown beneath the label inside the dropdown. */
  description?: string;
  /** 自定义搜索文本，缺省为 label + description / Override text used by cmdk filter. */
  searchValue?: string;
  /** 禁用此项 / Disable this option. */
  disabled?: boolean;
}

export interface SearchableSelectProps {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: SearchableSelectOption[];
  /** 触发器空状态文案 / Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** 搜索框占位 / Search input placeholder. */
  searchPlaceholder?: string;
  /** 无匹配文案 / Empty-state message in dropdown. */
  emptyMessage?: string;
  /** 标记表单错误态，红框 / Show invalid border for form errors. */
  invalid?: boolean;
  disabled?: boolean;
  /** 是否允许清空 / Whether to render a clear button when something is selected. */
  clearable?: boolean;
  /** 触发器额外样式（高度 / 宽度等） / Extra trigger className. */
  triggerClassName?: string;
  /** 触发器 id（关联 label） / Trigger id, for label htmlFor association. */
  id?: string;
  /** 自定义触发器内显示已选项 / Custom render for the selected label inside trigger. */
  renderSelected?: (option: SearchableSelectOption) => React.ReactNode;
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  searchPlaceholder = "搜索...",
  emptyMessage = "没有匹配项",
  invalid,
  disabled,
  clearable = false,
  triggerClassName,
  id,
  renderSelected,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );

  const handleSelect = (next: string) => {
    onChange(next);
    setOpen(false);
  };

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation();
    onChange(null);
  };

  const showClearButton = Boolean(clearable && selected && !disabled);

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button
            aria-expanded={open}
            aria-invalid={invalid ? true : undefined}
            className={cn(
              "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
              triggerClassName,
            )}
            data-invalid={invalid ? true : undefined}
            disabled={disabled}
            id={triggerId}
            type="button"
          >
            <span
              className={cn("min-w-0 flex-1 truncate", selected ? "" : "text-muted-foreground")}
            >
              {selected
                ? renderSelected
                  ? renderSelected(selected)
                  : selected.label
                : placeholder}
            </span>
            <span className="ml-2 flex shrink-0 items-center gap-1">
              {/* 占位 span：与下方绝对定位的清除按钮位置对齐，避免 chevron 被挤位。
                  Spacer span: keeps trigger layout stable so the absolute clear button below
                  lines up here without pushing the chevron. */}
              {showClearButton ? <span aria-hidden className="size-4" /> : null}
              <ChevronsUpDownIcon className="size-4 opacity-50" />
            </span>
          </button>
        </PopoverTrigger>
        {showClearButton ? (
          // 抽到 PopoverTrigger 外，避免 button-in-button 的水合错误。
          // 位置 right-8 对应触发器内占位 span 的位置。
          // Hoisted out of PopoverTrigger to avoid the nested-<button> hydration error.
          // right-8 aligns with the placeholder span inside the trigger.
          <button
            aria-label="清除已选"
            className="-translate-y-1/2 absolute top-1/2 right-8 inline-flex size-4 items-center justify-center rounded-sm opacity-60 hover:opacity-100"
            onClick={handleClear}
            type="button"
          >
            <XIcon className="size-3" />
          </button>
        ) : null}
      </div>
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
                const isSelected = option.value === value;
                return (
                  <CommandItem
                    disabled={option.disabled}
                    key={option.value}
                    onSelect={() => handleSelect(option.value)}
                    value={option.searchValue ?? `${option.label} ${option.description ?? ""}`}
                  >
                    <CheckIcon className={cn("size-4", isSelected ? "opacity-100" : "opacity-0")} />
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
  );
}
