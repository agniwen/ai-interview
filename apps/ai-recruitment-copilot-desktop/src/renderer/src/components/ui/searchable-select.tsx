"use client";

import type { ReactNode, WheelEvent } from "react";
import { useEffect, useId, useMemo, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { InputGroupAddon } from "@/components/ui/input-group";
import { cn } from "@arc/shared/utils";

// =====================================================================
// 单选可搜索下拉。底层使用 Coss/Base UI Combobox：输入框本身即搜索框。
// Single-pick searchable selector backed by Coss/Base UI Combobox. The input
// itself is searchable; no Command-in-Popover wrapper is needed.
// =====================================================================

export interface SearchableSelectOption {
  /** 唯一标识，提交给 onChange / Discriminator value passed to onChange. */
  value: string;
  /** 主显示文本 / Primary label rendered in trigger and option row. */
  label: string;
  /** 副信息（如部门 / 备注），出现在 option 第二行；为空则不显示。 */
  /** Secondary line shown beneath the label inside the dropdown. */
  description?: string;
  /** 可选头像 URL；在当前值与 option 行内展示。 */
  /** Optional avatar URL rendered with the selected value and option rows. */
  avatarUrl?: string | null;
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
  /** 是否必须保留一个已选值 / Whether an existing selection must not be cleared. */
  required?: boolean;
  /** 触发器额外样式（高度 / 宽度等） / Extra trigger className. */
  triggerClassName?: string;
  /** 下拉列表额外样式 / Extra option list className. */
  listClassName?: string;
  /** 下拉弹出方向 / Dropdown side relative to the input. */
  contentSide?: "bottom" | "top";
  /** 触发器 id（关联 label） / Trigger id, for label htmlFor association. */
  id?: string;
  /** 自定义触发器内显示已选项 / Custom render for the selected label inside trigger. */
  renderSelected?: (option: SearchableSelectOption) => ReactNode;
  /**
   * 服务端过滤模式：关闭本地 filter，由父组件根据 `onSearch` 拉取 options。
   * Server-side filter: skip local matching; parent loads options via `onSearch`.
   */
  serverSideFilter?: boolean;
  /**
   * 搜索词变化（打开时会先触发一次 `""`）。父组件应防抖后请求接口。
   * Fires on open with `""`, then as the user types. Debounce in the parent.
   */
  onSearch?: (query: string) => void;
  /** 服务端加载中时的空态文案旁提示（可选）。 */
  loading?: boolean;
}

function getOptionSearchText(option: SearchableSelectOption) {
  return option.searchValue ?? `${option.label} ${option.description ?? ""}`;
}

function filterSearchableOption(option: SearchableSelectOption, query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return getOptionSearchText(option).toLocaleLowerCase().includes(normalizedQuery);
}

function getOptionInitials(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

function SearchableSelectOptionAvatar({ option }: { option: SearchableSelectOption }) {
  if (option.avatarUrl === undefined) {
    return null;
  }
  return (
    <Avatar size="sm">
      {option.avatarUrl ? <AvatarImage alt={option.label} src={option.avatarUrl} /> : null}
      <AvatarFallback>{getOptionInitials(option.label)}</AvatarFallback>
    </Avatar>
  );
}

export function handleScrollableListWheel(event: WheelEvent<HTMLDivElement>) {
  const list = event.currentTarget;

  if (list.scrollHeight <= list.clientHeight || event.deltaY === 0) {
    return;
  }

  const previousScrollTop = list.scrollTop;
  list.scrollTop += event.deltaY;

  if (list.scrollTop !== previousScrollTop) {
    event.preventDefault();
    event.stopPropagation();
  }
}

const alwaysMatchFilter = () => true;

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  searchPlaceholder = "搜索…",
  emptyMessage = "没有匹配项",
  invalid,
  disabled,
  clearable = false,
  required = false,
  triggerClassName,
  listClassName,
  contentSide = "bottom",
  id,
  serverSideFilter = false,
  onSearch,
  loading = false,
}: SearchableSelectProps) {
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;

  const selected = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value],
  );
  const selectedLabel = selected?.label ?? "";

  useEffect(() => {
    if (!open) {
      setInputValue(selectedLabel);
    }
  }, [open, selectedLabel]);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      if (serverSideFilter) {
        // Open into search mode: clear selected label so typing is free-form.
        setInputValue("");
        onSearch?.("");
      }
      return;
    }
    setInputValue(selectedLabel);
  };

  const handleValueChange = (next: SearchableSelectOption | null) => {
    if (!next && required) {
      return;
    }
    onChange(next?.value ?? null);
    setInputValue(next?.label ?? "");
    setOpen(false);
  };

  const resolvedEmptyMessage = loading ? "加载中…" : emptyMessage;

  return (
    <Combobox<SearchableSelectOption>
      disabled={disabled}
      filter={serverSideFilter ? alwaysMatchFilter : filterSearchableOption}
      inputValue={inputValue}
      isItemEqualToValue={(item, selectedItem) => item.value === selectedItem.value}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      items={options}
      onInputValueChange={(next) => {
        setInputValue(next);
        if (open && serverSideFilter) {
          onSearch?.(next);
        }
      }}
      onOpenChange={handleOpenChange}
      onValueChange={handleValueChange}
      open={open}
      value={selected}
    >
      <ComboboxInput
        aria-invalid={invalid ? true : undefined}
        aria-required={required ? true : undefined}
        className={cn("w-full", triggerClassName)}
        disabled={disabled}
        id={triggerId}
        placeholder={open ? searchPlaceholder : placeholder}
        showClear={clearable}
      >
        {selected && !open ? (
          <InputGroupAddon align="inline-start">
            <SearchableSelectOptionAvatar option={selected} />
          </InputGroupAddon>
        ) : null}
      </ComboboxInput>
      <ComboboxContent
        className="min-w-72"
        collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
        side={contentSide}
      >
        <ComboboxEmpty>{resolvedEmptyMessage}</ComboboxEmpty>
        <ComboboxList
          className={cn("max-h-72 overflow-y-auto", listClassName)}
          onWheelCapture={handleScrollableListWheel}
        >
          {(option: SearchableSelectOption) => (
            <ComboboxItem disabled={option.disabled} key={option.value} value={option}>
              <SearchableSelectOptionAvatar option={option} />
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate">{option.label}</span>
                {option.description ? (
                  <span className="truncate text-muted-foreground text-xs">
                    {option.description}
                  </span>
                ) : null}
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export { filterSearchableOption, getOptionSearchText };
