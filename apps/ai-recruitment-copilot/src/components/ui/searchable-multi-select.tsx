"use client";

import { IconX } from "@tabler/icons-react";
import { useId, useMemo } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import type { SearchableSelectOption } from "@/components/ui/searchable-select";
import {
  filterSearchableOption,
  handleScrollableListWheel,
} from "@/components/ui/searchable-select";
import { cn } from "@arc/shared/utils";

// =====================================================================
// 多选可搜索下拉。底层使用 Coss/Base UI Combobox multiple，输入区直接可搜索。
// Multi-pick searchable selector backed by Coss/Base UI Combobox multiple.
// =====================================================================

type SelectedDisplayMode = "items" | "count";

export interface SearchableMultiSelectProps {
  value: string[];
  onChange: (value: string[]) => void;
  options: SearchableSelectOption[];
  /** 触发器空状态文案 / Trigger placeholder when nothing is selected. */
  placeholder?: string;
  /** 已选个数文案，例如 count => `已选 ${count} 位面试官`。 */
  /** Format the selected-count copy in the trigger. */
  selectedFormat?: (count: number) => string;
  /** Trigger display mode. Defaults to selected item labels with +N overflow. */
  selectedDisplay?: SelectedDisplayMode;
  /** Max selected item tags shown in the trigger before folding the rest into +N. */
  selectedPreviewLimit?: number;
  searchPlaceholder?: string;
  emptyMessage?: string;
  invalid?: boolean;
  disabled?: boolean;
  /** 是否在触发器下方显示已选项 badge 列表 / Opt in to selected badges below trigger. */
  showBadges?: boolean;
  /** Limit selected badges; overflow is rendered as a "+N" badge. */
  selectedBadgeLimit?: number;
  triggerClassName?: string;
  id?: string;
}

function getInitials(label: string): string {
  const trimmed = label.trim();
  return trimmed ? trimmed.slice(0, 1).toUpperCase() : "?";
}

export function SearchableMultiSelect({
  value,
  onChange,
  options,
  placeholder = "请选择",
  selectedFormat = (count) => `已选 ${count} 项`,
  selectedDisplay = "items",
  selectedPreviewLimit,
  searchPlaceholder = "搜索...",
  emptyMessage = "没有匹配项",
  invalid,
  disabled,
  showBadges = false,
  selectedBadgeLimit,
  triggerClassName,
  id,
}: SearchableMultiSelectProps) {
  const anchorRef = useComboboxAnchor();
  const fallbackId = useId();
  const triggerId = id ?? fallbackId;

  const selectedSet = useMemo(() => new Set(value), [value]);
  const selectedItems = useMemo(
    () => options.filter((item) => selectedSet.has(item.value)),
    [options, selectedSet],
  );
  const visibleSelectedItems =
    typeof selectedBadgeLimit === "number"
      ? selectedItems.slice(0, selectedBadgeLimit)
      : selectedItems;
  const hiddenSelectedCount = selectedItems.length - visibleSelectedItems.length;

  const remove = (next: string) => {
    onChange(value.filter((v) => v !== next));
  };

  return (
    <div className="flex flex-col gap-2">
      <Combobox<SearchableSelectOption, true>
        disabled={disabled}
        filter={filterSearchableOption}
        isItemEqualToValue={(item, selectedItem) => item.value === selectedItem.value}
        itemToStringLabel={(item) => item.label}
        itemToStringValue={(item) => item.value}
        items={options}
        multiple
        onValueChange={(next) => onChange(next.map((item) => item.value))}
        value={selectedItems}
      >
        <ComboboxChips className={cn("w-full", triggerClassName)} ref={anchorRef}>
          <ComboboxValue>
            {(selected: SearchableSelectOption[]) => {
              const visible =
                typeof selectedPreviewLimit === "number"
                  ? selected.slice(0, Math.max(0, selectedPreviewLimit))
                  : selected;
              const hiddenCount = selected.length - visible.length;

              return (
                <>
                  {selectedDisplay === "count" && selected.length > 0 ? (
                    <span className="min-w-0 truncate text-sm">
                      {selectedFormat(selected.length)}
                    </span>
                  ) : (
                    <>
                      {visible.map((item) => (
                        <ComboboxChip aria-label={item.value} key={item.value} title={item.label}>
                          {item.label}
                        </ComboboxChip>
                      ))}
                      {hiddenCount > 0 ? (
                        <Badge title={`还有 ${hiddenCount} 项未展示`} variant="secondary">
                          +{hiddenCount}
                        </Badge>
                      ) : null}
                    </>
                  )}
                  <ComboboxChipsInput
                    aria-invalid={invalid ? true : undefined}
                    aria-label={searchPlaceholder}
                    className={cn(selected.length > 0 && "min-w-8")}
                    id={triggerId}
                    placeholder={selected.length > 0 ? undefined : placeholder}
                  />
                </>
              );
            }}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent
          anchor={anchorRef}
          className="min-w-72"
          collisionAvoidance={{ side: "flip", align: "shift", fallbackAxisSide: "none" }}
        >
          <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
          <ComboboxList onWheelCapture={handleScrollableListWheel}>
            {(option: SearchableSelectOption) => (
              <ComboboxItem disabled={option.disabled} key={option.value} value={option}>
                {option.avatarUrl !== undefined ? (
                  <Avatar size="sm">
                    {option.avatarUrl ? (
                      <AvatarImage alt={option.label} src={option.avatarUrl} />
                    ) : null}
                    <AvatarFallback>{getInitials(option.label)}</AvatarFallback>
                  </Avatar>
                ) : null}
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
      {showBadges && selectedItems.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {visibleSelectedItems.map((item) => (
            <Badge key={item.value} variant="secondary">
              {item.label}
              <button
                aria-label={`移除 ${item.label}`}
                className="inline-flex size-4 items-center justify-center rounded-sm opacity-60 hover:bg-background/70 hover:opacity-100"
                disabled={disabled}
                onClick={() => remove(item.value)}
                type="button"
              >
                <IconX className="size-3" />
              </button>
            </Badge>
          ))}
          {hiddenSelectedCount > 0 ? (
            <Badge title={`还有 ${hiddenSelectedCount} 项未展示`} variant="outline">
              +{hiddenSelectedCount}
            </Badge>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
