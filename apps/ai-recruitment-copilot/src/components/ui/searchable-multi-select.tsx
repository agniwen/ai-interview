"use client";

import { CheckIcon, ChevronsUpDownIcon, XIcon } from "lucide-react";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { cn } from "@arc/shared/utils";
import { getVisibleSelectedItemCount } from "./searchable-multi-select-overflow";

// =====================================================================
// 多选可搜索下拉。Trigger 默认显示已选 item，空间不足时收敛成 +N。
// Multi-pick searchable selector. Trigger previews selected items and folds
// overflow into a +N badge.
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

interface SelectedPreviewMeasurements {
  containerWidth: number;
  itemWidths: number[];
  overflowBadgeWidth: number;
}

const SELECTED_PREVIEW_GAP = 4;
const INITIAL_MEASUREMENTS: SelectedPreviewMeasurements = {
  containerWidth: 0,
  itemWidths: [],
  overflowBadgeWidth: 0,
};

function areMeasurementsEqual(
  current: SelectedPreviewMeasurements,
  next: SelectedPreviewMeasurements,
) {
  return (
    current.containerWidth === next.containerWidth &&
    current.overflowBadgeWidth === next.overflowBadgeWidth &&
    current.itemWidths.length === next.itemWidths.length &&
    current.itemWidths.every((width, index) => width === next.itemWidths[index])
  );
}

function SelectedPreviewItem({
  children,
  measure,
  title,
}: {
  children: React.ReactNode;
  measure?: boolean;
  title?: string;
}) {
  return (
    <span
      className="inline-flex h-5 max-w-24 shrink-0 items-center rounded-sm bg-muted px-1.5 font-medium text-foreground text-xs"
      data-selected-preview-item={measure ? "" : undefined}
      title={title}
    >
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
}

function SelectedPreviewOverflow({ count, measure }: { count: number; measure?: boolean }) {
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center rounded-sm bg-muted px-1.5 font-medium text-muted-foreground text-xs"
      data-selected-preview-overflow={measure ? "" : undefined}
      title={`还有 ${count} 项未展示`}
    >
      +{count}
    </span>
  );
}

function SelectedItemsPreview({
  items,
  placeholder,
  selectedDisplay,
  selectedFormat,
  selectedPreviewLimit,
}: {
  items: SearchableSelectOption[];
  placeholder: string;
  selectedDisplay: SelectedDisplayMode;
  selectedFormat: (count: number) => string;
  selectedPreviewLimit?: number;
}) {
  const previewRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [measurements, setMeasurements] =
    useState<SelectedPreviewMeasurements>(INITIAL_MEASUREMENTS);
  const previewItems =
    typeof selectedPreviewLimit === "number"
      ? items.slice(0, Math.max(0, selectedPreviewLimit))
      : items;

  useLayoutEffect(() => {
    const previewElement = previewRef.current;
    const measureElement = measureRef.current;
    if (!previewElement || !measureElement) {
      return;
    }

    const measure = () => {
      const itemWidths = Array.from(
        measureElement.querySelectorAll<HTMLElement>("[data-selected-preview-item]"),
      ).map((element) => element.getBoundingClientRect().width);
      const overflowBadgeWidth =
        measureElement
          .querySelector<HTMLElement>("[data-selected-preview-overflow]")
          ?.getBoundingClientRect().width ?? 0;
      const next = {
        containerWidth: previewElement.getBoundingClientRect().width,
        itemWidths,
        overflowBadgeWidth,
      };

      setMeasurements((current) => (areMeasurementsEqual(current, next) ? current : next));
    };

    measure();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(previewElement);
    return () => observer.disconnect();
  }, [items, selectedDisplay, selectedPreviewLimit]);

  if (items.length === 0) {
    return (
      <span className="min-w-0 flex-1 truncate text-muted-foreground" ref={previewRef}>
        {placeholder}
      </span>
    );
  }

  if (selectedDisplay === "count") {
    return (
      <span className="min-w-0 flex-1 truncate" ref={previewRef}>
        {selectedFormat(items.length)}
      </span>
    );
  }

  const hasMeasurements =
    measurements.containerWidth > 0 && measurements.itemWidths.length === previewItems.length;
  const visibleCount = hasMeasurements
    ? getVisibleSelectedItemCount({
        containerWidth: measurements.containerWidth,
        gap: SELECTED_PREVIEW_GAP,
        itemWidths: measurements.itemWidths,
        overflowBadgeWidth: measurements.overflowBadgeWidth,
      })
    : previewItems.length;
  const visibleItems = previewItems.slice(0, visibleCount);
  const hiddenCount = items.length - visibleItems.length;
  const selectedTitle = items.map((item) => item.label).join("、");

  return (
    <span
      className="relative flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
      ref={previewRef}
      title={selectedTitle}
    >
      {visibleItems.map((item) => (
        <SelectedPreviewItem key={item.value} title={item.label}>
          {item.label}
        </SelectedPreviewItem>
      ))}
      {hiddenCount > 0 ? <SelectedPreviewOverflow count={hiddenCount} /> : null}
      <span
        aria-hidden
        className="pointer-events-none absolute h-0 overflow-hidden opacity-0"
        ref={measureRef}
      >
        {previewItems.map((item) => (
          <SelectedPreviewItem key={item.value} measure>
            {item.label}
          </SelectedPreviewItem>
        ))}
        <SelectedPreviewOverflow count={items.length} measure />
      </span>
    </span>
  );
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
  const [open, setOpen] = useState(false);
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
              "flex h-9 w-full items-center justify-between overflow-hidden rounded-md border border-input bg-background px-3 py-1 text-left text-sm transition-[color,box-shadow] focus-visible:border-ring focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[invalid=true]:border-destructive data-[invalid=true]:ring-[3px] data-[invalid=true]:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
              // 当前扁平化风格暂时关闭阴影；如需恢复，取消下一行注释。
              // "shadow-xs",
              triggerClassName,
            )}
            data-invalid={invalid ? true : undefined}
            disabled={disabled}
            id={triggerId}
            type="button"
          >
            <SelectedItemsPreview
              items={selectedItems}
              placeholder={placeholder}
              selectedDisplay={selectedDisplay}
              selectedFormat={selectedFormat}
              selectedPreviewLimit={selectedPreviewLimit}
            />
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
          {visibleSelectedItems.map((item) => (
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
