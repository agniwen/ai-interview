"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
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
  /** 可选头像 URL；多选下拉会在 option 行内展示。 */
  /** Optional avatar URL rendered by multi-select option rows. */
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
  /** 触发器额外样式（高度 / 宽度等） / Extra trigger className. */
  triggerClassName?: string;
  /** 触发器 id（关联 label） / Trigger id, for label htmlFor association. */
  id?: string;
  /** 自定义触发器内显示已选项 / Custom render for the selected label inside trigger. */
  renderSelected?: (option: SearchableSelectOption) => ReactNode;
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

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  emptyMessage = "没有匹配项",
  invalid,
  disabled,
  clearable = false,
  triggerClassName,
  id,
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
    if (!nextOpen) {
      setInputValue(selectedLabel);
    }
  };

  const handleValueChange = (next: SearchableSelectOption | null) => {
    onChange(next?.value ?? null);
    setInputValue(next?.label ?? "");
    setOpen(false);
  };

  return (
    <Combobox<SearchableSelectOption>
      disabled={disabled}
      filter={filterSearchableOption}
      inputValue={inputValue}
      isItemEqualToValue={(item, selectedItem) => item.value === selectedItem.value}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      items={options}
      onInputValueChange={(next) => setInputValue(next)}
      onOpenChange={handleOpenChange}
      onValueChange={handleValueChange}
      open={open}
      value={selected}
    >
      <ComboboxInput
        aria-invalid={invalid ? true : undefined}
        className={cn("w-full", triggerClassName)}
        disabled={disabled}
        id={triggerId}
        placeholder={placeholder}
        showClear={clearable}
      />
      <ComboboxContent className="min-w-72">
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>
          {(option: SearchableSelectOption) => (
            <ComboboxItem disabled={option.disabled} key={option.value} value={option}>
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
