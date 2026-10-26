"use client";

import type { Header, RowData } from "@tanstack/react-table";
import { flexRender } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
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

const OVERSCAN_ROWS = 8;

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

// 撑开未渲染行所占的滚动高度。Reserves the scroll height of rows outside the window.
function VirtualSpacerRow({ colSpan, height }: { colSpan: number; height: number }) {
  if (height <= 0) {
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
  const { props, table } = useDataGrid();
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
              <DataGridTableRenderedRow
                key={resolved.row.id}
                pinnedBoundary={resolved.pinnedBoundary}
                row={resolved.row}
                rowIndex={virtualRow.index}
                rowRef={virtualizer.measureElement}
              />
            );
          })}
          <VirtualSpacerRow colSpan={columnCount} height={paddingBottom} />
        </DataGridTableBody>
      </DataGridTableBase>
    </DataGridTableViewport>
  );
}
