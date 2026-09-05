"use client";

import { memo, useMemo } from "react";
import type { HTMLAttributes, ReactNode } from "react";
import { getColumnHeaderLabel, useDataGrid } from "@/components/reui/data-grid/data-grid";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { Subscribe } from "@tanstack/react-table";
import type { Column } from "@tanstack/react-table";

import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  IconArrowDown,
  IconArrowUp,
  IconSelector,
  IconCheck,
  IconArrowLeft,
  IconArrowRight,
  IconAdjustmentsHorizontal,
} from "@tabler/icons-react";

interface DataGridColumnHeaderProps<
  TData extends object,
  TValue,
> extends HTMLAttributes<HTMLDivElement> {
  column: Column<DataGridFeatures, TData, TValue>;
  /** When omitted, uses `column.columnDef.meta.headerTitle`, then a string `columnDef.header`, then `column.id`. */
  title?: string;
  icon?: ReactNode;
  filter?: ReactNode;
  visibility?: boolean;
}

function DataGridColumnHeaderInner<TData extends object, TValue>({
  column,
  title,
  icon,
  className,
  filter,
  visibility = false,
}: DataGridColumnHeaderProps<TData, TValue>) {
  const { i18n, isLoading, table, props } = useDataGrid();
  const resolvedTitle = title ?? getColumnHeaderLabel(column);

  // TanStack's columnOrder defaults to [] until a consumer seeds it; fall
  // back to the definition order so Move Left/Right work out of the box.
  const columnOrderState = table.state.columnOrder;
  const columnOrder =
    columnOrderState.length > 0
      ? columnOrderState
      : table.getAllLeafColumns().map((leafColumn) => leafColumn.id);
  const columnVisibilityKey =
    props.tableLayout?.columnsVisibility && visibility
      ? JSON.stringify(table.state.columnVisibility)
      : "";
  const isSorted = column.getIsSorted();
  const isPinned = column.getIsPinned();
  const canSort = column.getCanSort();
  const columnIndex = columnOrder.indexOf(column.id);
  const canMoveLeft = columnIndex > 0;
  const canMoveRight = columnIndex < columnOrder.length - 1;

  const handleSort = () => {
    if (isSorted === "asc") {
      column.toggleSorting(true);
    } else if (isSorted === "desc") {
      if (table.options.enableSortingRemoval === false) {
        column.toggleSorting(false);
      } else {
        column.clearSorting();
      }
    } else {
      column.toggleSorting(false);
    }
  };

  const headerLabelClassName = cn(
    "inline-flex h-full min-w-0 max-w-full items-center gap-1.5 truncate [&_svg]:size-3.5 [&_svg]:opacity-60",
    className,
  );

  const headerButtonClassName = cn(
    "text-secondary-foreground/80 hover:bg-secondary data-[state=open]:bg-secondary hover:text-foreground data-[state=open]:text-foreground rounded-sm",
  );

  const sortIcon =
    canSort &&
    (isSorted === "desc" ? (
      <IconArrowDown className="size-3.25" aria-hidden="true" />
    ) : isSorted === "asc" ? (
      <IconArrowUp className="size-3.25" aria-hidden="true" />
    ) : (
      <IconSelector className="mt-px size-3.25" aria-hidden="true" />
    ));

  const hasControls =
    props.tableLayout?.columnsMovable ||
    (props.tableLayout?.columnsVisibility && visibility) ||
    filter;
  const sortActionLabel =
    isSorted === "asc" ? i18n.labels.sortDescending : i18n.labels.sortAscending;

  const menuItems = useMemo(() => {
    const items: ReactNode[] = [];
    let hasPreviousSection = false;

    // Filter section
    if (filter) {
      items.push(
        <DropdownMenuGroup key="group-filter">
          <DropdownMenuLabel key="filter">{filter}</DropdownMenuLabel>
        </DropdownMenuGroup>,
      );
      hasPreviousSection = true;
    }

    // Sort section
    if (canSort) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-sort" />);
      }
      items.push(
        <DropdownMenuItem
          key="sort-asc"
          onClick={() => {
            if (isSorted === "asc") {
              if (table.options.enableSortingRemoval !== false) {
                column.clearSorting();
              }
            } else {
              column.toggleSorting(false);
            }
          }}
          disabled={!canSort}
        >
          <IconArrowUp className="size-3.5!" />
          <span className="grow">{i18n.labels.sortAscending}</span>
          {isSorted === "asc" && <IconCheck className="text-primary size-4 opacity-100!" />}
        </DropdownMenuItem>,
        <DropdownMenuItem
          key="sort-desc"
          onClick={() => {
            if (isSorted === "desc") {
              if (table.options.enableSortingRemoval !== false) {
                column.clearSorting();
              }
            } else {
              column.toggleSorting(true);
            }
          }}
          disabled={!canSort}
        >
          <IconArrowDown className="size-3.5!" />
          <span className="grow">{i18n.labels.sortDescending}</span>
          {isSorted === "desc" && <IconCheck className="text-primary size-4 opacity-100!" />}
        </DropdownMenuItem>,
      );
      hasPreviousSection = true;
    }

    // Move section
    if (props.tableLayout?.columnsMovable) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-move" />);
      }
      items.push(
        <DropdownMenuItem
          key="move-left"
          onClick={() => {
            if (columnIndex > 0) {
              const newOrder = [...columnOrder];
              const [movedColumn] = newOrder.splice(columnIndex, 1);
              newOrder.splice(columnIndex - 1, 0, movedColumn);
              table.setColumnOrder(newOrder);
            }
          }}
          disabled={!canMoveLeft || isPinned !== false}
        >
          <IconArrowLeft className="size-3.5!" aria-hidden="true" />
          <span>{i18n.labels.moveColumnStart}</span>
        </DropdownMenuItem>,
        <DropdownMenuItem
          key="move-right"
          onClick={() => {
            if (columnIndex < columnOrder.length - 1) {
              const newOrder = [...columnOrder];
              const [movedColumn] = newOrder.splice(columnIndex, 1);
              newOrder.splice(columnIndex + 1, 0, movedColumn);
              table.setColumnOrder(newOrder);
            }
          }}
          disabled={!canMoveRight || isPinned !== false}
        >
          <IconArrowRight className="size-3.5!" aria-hidden="true" />
          <span>{i18n.labels.moveColumnEnd}</span>
        </DropdownMenuItem>,
      );
      hasPreviousSection = true;
    }

    // Visibility section
    if (props.tableLayout?.columnsVisibility && visibility) {
      if (hasPreviousSection) {
        items.push(<DropdownMenuSeparator key="sep-visibility" />);
      }
      items.push(
        <DropdownMenuSub key="visibility">
          <DropdownMenuSubTrigger>
            <IconAdjustmentsHorizontal className="size-3.5!" />
            <span>{i18n.labels.columnsMenu}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent side="right">
            {table
              .getAllColumns()
              .filter((col) => col.getCanHide())
              .map((col) => (
                <DropdownMenuCheckboxItem
                  key={col.id}
                  checked={col.getIsVisible()}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(value) => col.toggleVisibility(!!value)}
                  className="capitalize"
                >
                  {getColumnHeaderLabel(col)}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>,
      );
    }

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    filter,
    canSort,
    isSorted,
    column,
    props.tableLayout?.columnsMovable,
    props.tableLayout?.columnsVisibility,
    isPinned,
    canMoveLeft,
    canMoveRight,
    visibility,
    table,
    columnIndex,
    columnOrder,
    columnVisibilityKey, // Needed to update checkbox states when visibility changes
  ]);

  if (hasControls) {
    return (
      <div className="flex h-full min-w-0 w-full items-center gap-1">
        <span className={headerLabelClassName} title={resolvedTitle}>
          {icon && icon}
          {resolvedTitle}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                aria-label={`${resolvedTitle}：${i18n.labels.columnsMenu}`}
                className={headerButtonClassName}
                disabled={isLoading}
                size="icon-xs"
                title={`${resolvedTitle}：${i18n.labels.columnsMenu}`}
                variant="ghost"
              >
                {sortIcon || <IconAdjustmentsHorizontal aria-hidden="true" />}
              </Button>
            }
          />
          <DropdownMenuContent className="w-40" align="start">
            {menuItems}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  if (canSort) {
    return (
      <div className="flex h-full min-w-0 w-full items-center gap-1">
        <span className={headerLabelClassName} title={resolvedTitle}>
          {icon && icon}
          {resolvedTitle}
        </span>
        <Button
          aria-label={`${resolvedTitle}：${sortActionLabel}`}
          className={headerButtonClassName}
          disabled={isLoading}
          onClick={handleSort}
          size="icon-xs"
          title={`${resolvedTitle}：${sortActionLabel}`}
          variant="ghost"
        >
          {sortIcon}
        </Button>
      </div>
    );
  }

  return (
    <div className={headerLabelClassName}>
      {icon && icon}
      {resolvedTitle}
    </div>
  );
}

const DataGridColumnHeaderMemo = memo(DataGridColumnHeaderInner) as <TData extends object, TValue>(
  props: DataGridColumnHeaderProps<TData, TValue> & {
    /** Internal: the state slices the header re-renders on. Not part of the public API. */
    subscribedState?: unknown;
  },
) => ReactNode;

/**
 * Sort and pin state reaches this header through builder calls on `column`
 * (`getIsSorted()`, `getIsPinned()`), and `column` is a stable reference. That
 * combination is the one v9's fresh-table-per-state-change does NOT cover:
 * React Compiler is free to memoize against the stable column and never
 * re-evaluate those reads, which shows up as frozen sort arrows and move
 * controls for pinned columns. The `Subscribe` below turns the slices this header actually reads
 * into a real reactive dependency, and threading the selection through as a
 * prop is what lets it past the `memo` - which would otherwise see unchanged
 * props and skip the render anyway.
 */
function DataGridColumnHeader<TData extends object, TValue>(
  props: DataGridColumnHeaderProps<TData, TValue>,
) {
  const { table } = useDataGrid();

  return (
    <Subscribe
      source={table.store}
      selector={(state) => ({
        sorting: state.sorting,
        columnPinning: state.columnPinning,
        columnOrder: state.columnOrder,
        columnVisibility: state.columnVisibility,
      })}
    >
      {(subscribed) => <DataGridColumnHeaderMemo {...props} subscribedState={subscribed} />}
    </Subscribe>
  );
}

export { DataGridColumnHeader, type DataGridColumnHeaderProps };
