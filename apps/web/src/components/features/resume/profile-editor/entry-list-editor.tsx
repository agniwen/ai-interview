"use client";

import { IconChevronDown, IconPlus, IconTrash } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { SortableDragHandle, SortableItem, SortableList } from "@/components/ui/sortable-list";
import { cn } from "@app/shared/utils";

export interface EntryListItem {
  key: string;
}

export interface EntryListEditorProps<TItem extends EntryListItem> {
  items: TItem[];
  onChange: (items: TItem[]) => void;
  createItem: () => TItem;
  /** 条目名，用于按钮与无障碍文案，例如「工作经历」。 */
  itemLabel: string;
  emptyText: string;
  /** 折叠态展示的标题与补充信息。 */
  summarize: (item: TItem) => { title: string; meta?: string };
  renderFields: (item: TItem, update: (patch: Partial<Omit<TItem, "key">>) => void) => ReactNode;
  disabled?: boolean;
  maxItems?: number;
}

function moveItem<TItem>(items: readonly TItem[], from: number, to: number): TItem[] {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  if (moved !== undefined) {
    next.splice(to, 0, moved);
  }
  return next;
}

/**
 * 可重复条目编辑器（工作 / 项目 / 教育经历）：卡片可折叠、拖拽排序、删除；新增条目默认展开。
 * Repeatable entry editor: collapsible, drag-sortable, removable cards; new entries open expanded.
 */
export function EntryListEditor<TItem extends EntryListItem>({
  items,
  onChange,
  createItem,
  itemLabel,
  emptyText,
  summarize,
  renderFields,
  disabled = false,
  maxItems = 50,
}: EntryListEditorProps<TItem>) {
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(() => new Set());

  function setExpanded(key: string, expanded: boolean) {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (expanded) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  function updateItem(key: string, patch: Partial<Omit<TItem, "key">>) {
    onChange(items.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  }

  function addItem() {
    const item = createItem();
    onChange([...items, item]);
    setExpanded(item.key, true);
  }

  return (
    <div className="flex flex-col gap-2">
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed px-3 py-4 text-center text-muted-foreground text-sm">
          {emptyText}
        </p>
      ) : (
        <SortableList
          className="space-y-2"
          ids={items.map((item) => item.key)}
          onReorder={(from, to) => onChange(moveItem(items, from, to))}
        >
          {items.map((item, index) => {
            const expanded = expandedKeys.has(item.key);
            const { title, meta } = summarize(item);
            const displayTitle = title || `未填写的${itemLabel}`;
            const bodyId = `entry-${item.key}`;
            return (
              <SortableItem disabled={disabled} id={item.key} key={item.key}>
                {({ handleProps }) => (
                  <div className="rounded-lg border bg-card">
                    <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-1">
                      <SortableDragHandle
                        {...handleProps}
                        aria-label={`拖动排序第 ${index + 1} 段${itemLabel}`}
                      />
                      <button
                        aria-controls={bodyId}
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left hover:bg-accent/50"
                        onClick={() => setExpanded(item.key, !expanded)}
                        type="button"
                      >
                        <span
                          className={cn(
                            "min-w-0 truncate font-medium text-sm",
                            !title && "text-muted-foreground",
                          )}
                        >
                          {displayTitle}
                        </span>
                        {meta ? (
                          <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                            {meta}
                          </span>
                        ) : null}
                        <IconChevronDown
                          className={cn(
                            "ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                            expanded && "rotate-180",
                          )}
                        />
                      </button>
                      <Button
                        aria-label={`删除${itemLabel}「${displayTitle}」`}
                        disabled={disabled}
                        onClick={() => onChange(items.filter((entry) => entry.key !== item.key))}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                      >
                        <IconTrash />
                      </Button>
                    </div>
                    {expanded ? (
                      <div className="border-t px-3 pt-3 pb-3" id={bodyId}>
                        {renderFields(item, (patch) => updateItem(item.key, patch))}
                      </div>
                    ) : null}
                  </div>
                )}
              </SortableItem>
            );
          })}
        </SortableList>
      )}
      <Button
        className="self-start"
        disabled={disabled || items.length >= maxItems}
        onClick={addItem}
        size="sm"
        type="button"
        variant="outline"
      >
        <IconPlus data-icon="inline-start" />
        添加{itemLabel}
      </Button>
    </div>
  );
}
