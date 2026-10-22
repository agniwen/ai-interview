import { IconChevronRight } from "@tabler/icons-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { MemberTreeRecord, MemberTreeRow } from "./members-tree-model";

const ROW_HEIGHT = 56;
const TREE_INDENT = 20;
const SKELETON_ROW_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

export interface MembersTreeTableSelection {
  onToggle: (userId: string, selected: boolean) => void;
  /** 勾选或取消当前可见的全部行。Selects or clears every visible row. */
  onToggleVisible: (selected: boolean) => void;
  selectedUserIds: ReadonlySet<string>;
}

const SELECTION_COLUMN_WIDTH = "2.5rem";

export interface MembersTreeTableColumn<T extends MemberTreeRecord> {
  cell: (row: MemberTreeRow<T>) => ReactNode;
  className?: string;
  key: string;
  title: ReactNode;
  /** CSS grid track, e.g. `minmax(16rem,2fr)`. */
  width: string;
}

/**
 * 成员汇报线树表：一次加载全部成员，按展开状态压平后虚拟滚动；首列带缩进与展开按钮。
 * Reporting-line tree table: all members are loaded once, flattened by expansion state, and
 * virtualized. The first column carries indentation and the expand toggle.
 */
export function MembersTreeTable<T extends MemberTreeRecord>({
  columns,
  empty,
  loading,
  onToggle,
  rows,
  selection,
}: {
  columns: MembersTreeTableColumn<T>[];
  empty: ReactNode;
  loading: boolean;
  onToggle: (userId: string) => void;
  rows: MemberTreeRow<T>[];
  /** 传入时在首列前显示多选框。Shows a leading selection column when provided. */
  selection?: MembersTreeTableSelection;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => rows[index]?.record.userId ?? index,
    getScrollElement: () => scrollRef.current,
    overscan: 8,
  });
  const gridStyle: CSSProperties = {
    gridTemplateColumns: [
      ...(selection ? [SELECTION_COLUMN_WIDTH] : []),
      ...columns.map((column) => column.width),
    ].join(" "),
  };
  const selectedVisibleCount = selection
    ? rows.filter((row) => selection.selectedUserIds.has(row.record.userId)).length
    : 0;
  const allVisibleSelected = rows.length > 0 && selectedVisibleCount === rows.length;
  const [firstColumn, ...restColumns] = columns;

  if (!loading && rows.length === 0) {
    return <>{empty}</>;
  }

  return (
    <div
      aria-busy={loading || undefined}
      className="max-h-[calc(100dvh-13rem)] min-h-40 overflow-auto rounded-lg bg-control shadow-default"
      ref={scrollRef}
    >
      <table aria-rowcount={rows.length + 1} className="block min-w-[90rem]">
        <thead className="sticky top-0 z-10 block bg-control">
          <tr
            className="grid h-10 items-center border-border border-b px-4 font-medium text-muted-foreground text-xs"
            style={gridStyle}
          >
            {selection ? (
              <th className="flex items-center px-2">
                <Checkbox
                  aria-label="选择当前列表中的全部成员"
                  checked={allVisibleSelected}
                  disabled={loading || rows.length === 0}
                  indeterminate={selectedVisibleCount > 0 && !allVisibleSelected}
                  onCheckedChange={(checked) => selection.onToggleVisible(checked === true)}
                />
              </th>
            ) : null}
            {columns.map((column) => (
              <th
                className={cn("min-w-0 px-2 text-left font-medium", column.className)}
                key={column.key}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>

        {loading ? (
          <tbody aria-hidden className="block">
            {SKELETON_ROW_KEYS.map((key) => (
              <tr
                className="grid items-center border-border/60 border-b px-4 last:border-b-0"
                key={key}
                style={{ ...gridStyle, height: ROW_HEIGHT }}
              >
                {selection ? (
                  <td className="px-2">
                    <Skeleton className="size-4 rounded-sm" />
                  </td>
                ) : null}
                {columns.map((column) => (
                  <td className="px-2" key={column.key}>
                    <Skeleton className="h-4 w-3/4" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ) : (
          <tbody className="relative block w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!(row && firstColumn)) {
                return null;
              }
              const canExpand = row.directReportCount > 0;
              return (
                <tr
                  aria-rowindex={virtualRow.index + 2}
                  className={cn(
                    "absolute inset-x-0 grid items-center border-border/60 border-b px-4 transition-colors hover:bg-muted/40",
                    selection?.selectedUserIds.has(row.record.userId) && "bg-muted/60",
                  )}
                  key={virtualRow.key}
                  style={{
                    ...gridStyle,
                    height: ROW_HEIGHT,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  {selection ? (
                    <td className="flex items-center px-2">
                      <Checkbox
                        aria-label={`选择 ${row.record.name}`}
                        checked={selection.selectedUserIds.has(row.record.userId)}
                        onCheckedChange={(checked) =>
                          selection.onToggle(row.record.userId, checked === true)
                        }
                      />
                    </td>
                  ) : null}
                  <td
                    className={cn("flex min-w-0 items-center gap-1 px-2", firstColumn.className)}
                    style={{ paddingInlineStart: row.depth * TREE_INDENT }}
                  >
                    {canExpand ? (
                      <button
                        aria-expanded={row.isExpanded}
                        aria-label={
                          row.isExpanded
                            ? `收起 ${row.record.name} 的下级`
                            : `展开 ${row.record.name} 的下级`
                        }
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onToggle(row.record.userId)}
                        type="button"
                      >
                        <IconChevronRight
                          aria-hidden
                          className={cn(
                            "size-4 transition-transform duration-200",
                            row.isExpanded && "rotate-90",
                          )}
                        />
                      </button>
                    ) : (
                      <span aria-hidden className="size-7 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">{firstColumn.cell(row)}</div>
                  </td>
                  {restColumns.map((column) => (
                    <td className={cn("min-w-0 px-2", column.className)} key={column.key}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        )}
      </table>
    </div>
  );
}
