"use client";

import type { Header, RowData } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Ref } from "react";
import { useDataGrid } from "@/components/reui/data-grid/data-grid";
import {
  DataGridTableBase,
  DataGridTableBody,
  DataGridTableEmpty,
  DataGridTableHead,
  DataGridTableHeadRow,
  DataGridTableHeadRowCell,
  DataGridTableRenderedRow,
  DataGridTableViewport,
  getDataGridScrollAreaViewport,
  getDataGridTableMergedHeaderGroups,
  getDataGridTableResolvedRows,
} from "@/components/reui/data-grid/data-grid-table";
import type { DataGridFeatures } from "../table-features";

// 快速滚动时浏览器先于 JS 合成滚动，窗口外多预渲染一些行可避免露出空白。
// Native scrolling outruns JS during fast flings; a deeper overscan keeps rows ready.
const OVERSCAN_ROWS = 16;

export interface DataGridVirtualTableProps {
  /** 行的估算高度（px），与 DataGrid 的固定行高一致。Estimated row height in px. */
  estimateRowHeight: number;
  /** 距离已加载末尾多少行时触发加载下一页。Rows before the loaded end that trigger the next page. */
  loadMoreThreshold?: number;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

function HeaderCell<TData extends RowData>({
  header,
}: {
  header: Header<DataGridFeatures, TData, unknown>;
}) {
  return (
    <DataGridTableHeadRowCell header={header}>
      {header.isPlaceholder
        ? null
        : flexRender(header.column.columnDef.header, header.getContext())}
    </DataGridTableHeadRowCell>
  );
}

type ResolvedRow = ReturnType<typeof getDataGridTableResolvedRows>[number];

interface VirtualRowProps {
  // 行对象在行模型不变时保持同一引用；不要传每次渲染新建的 resolved 包装对象。
  // Row objects keep their identity while the row model is unchanged; never pass a fresh wrapper.
  row: ResolvedRow["row"];
  pinnedBoundary: ResolvedRow["pinnedBoundary"];
  rowIndex: number;
  rowRef: Ref<HTMLTableRowElement>;
  // 以下仅用于浅比较：列定义、固定与显隐变化时必须重渲染单元格。
  // Compared only: cells must re-render when column defs, pinning or visibility change.
  columns: object;
  columnPinning: object;
  columnVisibility: object;
}

/**
 * 虚拟器每次滚动都会重渲染窗口；行做浅比较 memo 后，只有新进入窗口的行需要渲染单元格。
 * 行选中状态由勾选框和行底色各自订阅，不依赖这里重渲染。
 * The virtualizer re-renders on every scroll; memoized rows mean only rows entering the window
 * render their cells. Selection updates through its own subscriptions.
 */
const VirtualRow = memo(function VirtualRow({
  pinnedBoundary,
  row,
  rowIndex,
  rowRef,
}: VirtualRowProps) {
  return (
    <DataGridTableRenderedRow
      pinnedBoundary={pinnedBoundary}
      row={row}
      rowIndex={rowIndex}
      rowRef={rowRef}
    />
  );
});

// 撑开未渲染行所占的滚动高度。Reserves the scroll height of rows outside the window.
function VirtualSpacerRow({
  colSpan,
  height,
  persistent = false,
}: {
  colSpan: number;
  height: number;
  persistent?: boolean;
}) {
  if (height <= 0 && !persistent) {
    return null;
  }
  return (
    <tr aria-hidden="true" data-slot="data-grid-virtual-spacer" style={{ height }}>
      <td aria-hidden="true" className="border-0 p-0" colSpan={colSpan} />
    </tr>
  );
}

/**
 * 行虚拟化的 DataGrid 表格：只渲染可视窗口内的行，上下用占位行撑开滚动高度；
 * 滚动接近已加载末尾时请求下一页。必须放在 DataGridScrollArea 内并给定最大高度。
 * Row-virtualized grid table: renders only the visible window with spacer rows above and
 * below, and requests the next page near the loaded end. Must live inside a height-bounded
 * DataGridScrollArea.
 */
export function DataGridVirtualTable({
  estimateRowHeight,
  fetchNextPage,
  hasNextPage,
  isFetchingNextPage,
  loadMoreThreshold = 10,
}: DataGridVirtualTableProps) {
  const { props, table } = useDataGrid<object>();
  // 滚动容器是 DataGridScrollArea 的视口，挂载后才能解析；存进 state 以便解析到时重新渲染，
  // 让虚拟器绑定滚动监听。The scroll viewport only resolves after mount; keeping it in state
  // re-renders once it is found so the virtualizer binds its listeners.
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollElement, setScrollElement] = useState<HTMLElement | null>(null);
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- runs every commit; the identity guard stops repeat updates.
  useLayoutEffect(() => {
    const node = tableViewportRef.current;
    const next = node ? getDataGridScrollAreaViewport(node) : null;
    if (next !== scrollElement) {
      setScrollElement(next);
    }
  });

  const rows = getDataGridTableResolvedRows(table, props.tableLayout?.rowsPinnable);
  // oxlint-disable-next-line react/incompatible-library -- TanStack Virtual is compiler-incompatible and is intentionally skipped.
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize: () => estimateRowHeight,
    getItemKey: (index) => rows[index]?.row.id ?? index,
    getScrollElement: () => scrollElement,
    overscan: OVERSCAN_ROWS,
  });
  const virtualRows = virtualizer.getVirtualItems();
  const lastVirtualIndex = virtualRows.at(-1)?.index ?? -1;

  useEffect(() => {
    if (
      hasNextPage &&
      !isFetchingNextPage &&
      lastVirtualIndex >= rows.length - 1 - loadMoreThreshold
    ) {
      fetchNextPage();
    }
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    lastVirtualIndex,
    loadMoreThreshold,
    rows.length,
  ]);

  const paddingTop = virtualRows[0]?.start ?? 0;
  const paddingBottom = virtualRows.length
    ? virtualizer.getTotalSize() - (virtualRows.at(-1)?.end ?? 0)
    : 0;
  const mergedHeaderGroups = getDataGridTableMergedHeaderGroups(table);
  const columnCount = table.getVisibleLeafColumns().length;
  const { columns } = table.options;
  const { columnPinning, columnVisibility } = table.state;

  return (
    <DataGridTableViewport viewportRef={tableViewportRef}>
      <DataGridTableBase>
        <DataGridTableHead>
          {mergedHeaderGroups.map((headerGroup) => (
            <DataGridTableHeadRow key={headerGroup.id} rowId={headerGroup.id}>
              {headerGroup.headers
                .filter((header) => header.column.getIsPinned() !== "end")
                .map((header) => (
                  <HeaderCell header={header} key={header.id} />
                ))}
              {headerGroup.headers
                .filter((header) => header.column.getIsPinned() === "end")
                .map((header) => (
                  <HeaderCell header={header} key={header.id} />
                ))}
            </DataGridTableHeadRow>
          ))}
        </DataGridTableHead>
        <DataGridTableBody>
          {rows.length === 0 ? <DataGridTableEmpty /> : null}
          <VirtualSpacerRow colSpan={columnCount} height={paddingTop} />
          {virtualRows.map((virtualRow) => {
            const resolved = rows[virtualRow.index];
            if (!resolved) {
              return null;
            }
            return (
              <VirtualRow
                columnPinning={columnPinning}
                columnVisibility={columnVisibility}
                columns={columns}
                key={resolved.row.id}
                pinnedBoundary={resolved.pinnedBoundary}
                row={resolved.row}
                rowIndex={virtualRow.index}
                rowRef={virtualizer.measureElement}
              />
            );
          })}
          {/* 底部占位行始终保留，数据行就不会成为 tbody 的 :last-child。行样式里的
              `tbody:has(+tfoot) tr:last-child` 一旦被求值，Chrome 会给 tbody 留下 :has 失效标记，
              之后每插入一行都要重算整张表的样式（滚到底后每次约 60ms，表现为滚动白屏）。
              The bottom spacer always renders so no data row becomes tbody's :last-child. Once the
              row style `tbody:has(+tfoot) tr:last-child` is evaluated, Chrome keeps :has invalidation
              flags on the tbody and restyles the whole table on every row insertion. */}
          <VirtualSpacerRow colSpan={columnCount} height={paddingBottom} persistent />
        </DataGridTableBody>
      </DataGridTableBase>
    </DataGridTableViewport>
  );
}
