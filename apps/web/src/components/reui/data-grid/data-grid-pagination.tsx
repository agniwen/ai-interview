"use client";

import type { JSX, ReactNode } from "react";
import { useDataGrid } from "@/components/reui/data-grid/data-grid";

import { cn } from "@app/shared/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface DataGridPaginationProps {
  sizes?: number[];
  sizesInfo?: string;
  sizesLabel?: string;
  sizesDescription?: string;
  sizesSkeleton?: ReactNode;
  more?: boolean;
  moreLimit?: number;
  info?: string;
  infoSkeleton?: ReactNode;
  className?: string;
  rowsPerPageLabel?: string;
  previousPageLabel?: string;
  nextPageLabel?: string;
  ellipsisText?: string;
}

function DataGridPagination(props: DataGridPaginationProps): JSX.Element {
  const { i18n, table, recordCount, isLoading } = useDataGrid();

  const defaultProps: Partial<DataGridPaginationProps> = {
    sizes: [5, 10, 25, 50, 100],
    sizesSkeleton: <Skeleton className="h-8 w-32 max-w-full" />,
    moreLimit: 5,
    infoSkeleton: <Skeleton className="h-5 w-28 max-w-full" />,
    rowsPerPageLabel: i18n.labels.rowsPerPage,
    previousPageLabel: i18n.labels.previousPage,
    nextPageLabel: i18n.labels.nextPage,
    ellipsisText: i18n.labels.paginationEllipsis,
  };

  const mergedProps: DataGridPaginationProps = { ...defaultProps, ...props };

  const btnBaseClasses = "p-0 text-sm";
  const btnArrowClasses = btnBaseClasses + " rtl:transform rtl:rotate-180";
  const pageIndex = table.state.pagination.pageIndex;
  const pageSize = table.state.pagination.pageSize;
  const from = recordCount === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min((pageIndex + 1) * pageSize, recordCount);
  const pageCount = table.getPageCount();

  // A supplied `info` keeps its placeholder-template contract; the default
  // routes through the i18n label function, where word order is free.
  const paginationInfo = mergedProps.info
    ? mergedProps.info
        .replaceAll("{from}", from.toString())
        .replaceAll("{to}", to.toString())
        .replaceAll("{count}", recordCount.toString())
    : i18n.labels.paginationInfo({ from, to, count: recordCount });

  // Pagination limit logic
  const paginationMoreLimit = mergedProps.moreLimit || 5;

  // Determine the start and end of the pagination group
  const currentGroupStart = Math.floor(pageIndex / paginationMoreLimit) * paginationMoreLimit;
  const currentGroupEnd = Math.min(currentGroupStart + paginationMoreLimit, pageCount);

  // Render page buttons based on the current group
  const renderPageButtons = () => {
    const buttons = [];
    for (let i = currentGroupStart; i < currentGroupEnd; i++) {
      const isCurrentPage = pageIndex === i;
      buttons.push(
        <Button
          key={i}
          size="icon-sm"
          variant="ghost"
          aria-label={i18n.labels.goToPage(i + 1)}
          aria-current={isCurrentPage ? "page" : undefined}
          className={cn(btnBaseClasses, "text-muted-foreground hover:border-transparent", {
            "border-border/80 bg-accent text-accent-foreground hover:border-border/80":
              isCurrentPage,
          })}
          onClick={() => {
            if (!isCurrentPage) {
              table.setPageIndex(i);
            }
          }}
        >
          {i + 1}
        </Button>,
      );
    }
    return buttons;
  };

  // Render a "previous" ellipsis button if there are previous pages to show
  const renderEllipsisPrevButton = () => {
    if (currentGroupStart > 0) {
      return (
        <Button
          size="icon-sm"
          className={btnBaseClasses}
          variant="ghost"
          onClick={() => table.setPageIndex(currentGroupStart - 1)}
        >
          {mergedProps.ellipsisText}
        </Button>
      );
    }
    return null;
  };

  // Render a "next" ellipsis button if there are more pages to show after the current group
  const renderEllipsisNextButton = () => {
    if (currentGroupEnd < pageCount) {
      return (
        <Button
          className={btnBaseClasses}
          variant="ghost"
          size="icon-sm"
          onClick={() => table.setPageIndex(currentGroupEnd)}
        >
          {mergedProps.ellipsisText}
        </Button>
      );
    }
    return null;
  };

  return (
    <div
      data-slot="data-grid-pagination"
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t px-3 py-2 text-sm sm:min-h-11 sm:flex sm:flex-row sm:gap-2.5 sm:py-0.5",
        mergedProps.className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        {isLoading ? (
          mergedProps.sizesSkeleton
        ) : (
          <>
            <div className="shrink-0 text-muted-foreground text-sm">
              {mergedProps.rowsPerPageLabel}
            </div>
            <Select
              value={`${pageSize}`}
              onValueChange={(value) => {
                const newPageSize = Number(value);
                table.setPageSize(newPageSize);
              }}
            >
              {/* w-fit with a min, never a fixed width: a fixed w-16 clipped
                  the value "100" by 1px at nova's paddings, while fit-content
                  grows the trigger for 3-digit sizes and the min keeps the
                  1-2 digit ones from collapsing narrower than 64px. */}
              <SelectTrigger
                aria-label={mergedProps.rowsPerPageLabel}
                className="w-fit min-w-16"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                className="min-w-(--anchor-width)"
              >
                {mergedProps.sizes?.map((size: number) => (
                  <SelectItem key={size} value={`${size}`}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
      </div>
      <div className="col-start-2 justify-self-end text-nowrap text-muted-foreground text-sm sm:ms-auto">
        {isLoading ? mergedProps.infoSkeleton : paginationInfo}
      </div>
      {!isLoading && pageCount > 1 ? (
        <div className="col-span-2 flex items-center justify-center gap-1 sm:col-auto sm:justify-end">
          <Button
            size="icon-sm"
            variant="ghost"
            className={btnArrowClasses}
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <span className="sr-only">{mergedProps.previousPageLabel}</span>
            <IconChevronLeft />
          </Button>

          <div
            className="min-w-16 text-center text-muted-foreground text-sm tabular-nums sm:hidden"
            data-slot="data-grid-pagination-mobile-info"
          >
            {pageIndex + 1} / {pageCount}
          </div>

          <div className="hidden items-center gap-1 sm:flex">
            {renderEllipsisPrevButton()}
            {renderPageButtons()}
            {renderEllipsisNextButton()}
          </div>

          <Button
            size="icon-sm"
            variant="ghost"
            className={btnArrowClasses}
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <span className="sr-only">{mergedProps.nextPageLabel}</span>
            <IconChevronRight />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export { DataGridPagination, type DataGridPaginationProps };
