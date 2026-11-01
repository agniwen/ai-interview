"use client";

import type { ReactNode } from "react";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { Toolbar } from "./parts/toolbar";
import type { ToolbarFilterConfig } from "./parts/toolbar";
import { ListLoadError } from "./list-load-error";

export interface DataCardListProps<TData> {
  data: TData[];
  loading?: boolean;
  refetching?: boolean;

  getRowId: (row: TData) => string;
  renderCard: (row: TData) => ReactNode;
  /** 首次加载时铺满网格的卡片骨架。Card skeleton repeated while the first page loads. */
  cardSkeleton: ReactNode;
  skeletonCount?: number;

  filters?: ToolbarFilterConfig[];
  filterStorageKey?: string;
  filterValues?: Record<string, string>;
  onFilterChange?: (key: string, value: string) => void;
  toolbarRight?: ReactNode;

  empty: ReactNode;
  error?: unknown;
  onRefresh?: () => void;
  onRetry?: () => void;
  onResetFilters?: (clearedValues?: Record<string, string>) => void;
  canResetFilters?: boolean;
}

const CARD_GRID_CLASS =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5";

export function DataCardListSkeleton({
  cardSkeleton,
  count = 8,
}: {
  cardSkeleton: ReactNode;
  count?: number;
}) {
  return (
    <div className={CARD_GRID_CLASS}>
      {Array.from({ length: count }, (_, index) => (
        <div key={index}>{cardSkeleton}</div>
      ))}
    </div>
  );
}

/**
 * DataGrid 的卡片版：同一套工具栏、空态与错误态，一次展示全部卡片、不分页。
 * Unpaginated card-grid sibling of DataGrid sharing its toolbar, empty and error states.
 */
export function DataCardList<TData>({
  canResetFilters,
  cardSkeleton,
  data,
  empty,
  error,
  filterStorageKey,
  filterValues,
  filters,
  getRowId,
  loading,
  onFilterChange,
  onRefresh,
  onResetFilters,
  onRetry,
  refetching,
  renderCard,
  skeletonCount = 8,
  toolbarRight,
}: DataCardListProps<TData>) {
  const isInitialLoading = Boolean(loading) && data.length === 0 && !error;
  const emptyContent = error ? (
    <ListLoadError error={error} onRetry={onRetry ?? onRefresh} />
  ) : (
    empty
  );

  const skeleton = <DataCardListSkeleton cardSkeleton={cardSkeleton} count={skeletonCount} />;

  return (
    <div className="flex flex-col gap-4">
      <Toolbar
        canResetFilters={canResetFilters}
        filterStorageKey={filterStorageKey}
        filterValues={filterValues}
        filters={filters}
        onFilterChange={onFilterChange}
        onRefresh={onRefresh}
        onResetFilters={onResetFilters}
        refreshing={refetching}
        searchLoading={loading}
        toolbarRight={toolbarRight}
      />

      {error && data.length > 0 ? (
        <ListLoadError compact error={error} onRetry={onRetry ?? onRefresh} />
      ) : null}

      <SkeletonReveal className="min-w-0" loading={isInitialLoading} skeleton={skeleton}>
        {data.length > 0 ? (
          <ul className={CARD_GRID_CLASS}>
            {data.map((row) => (
              <li className="min-w-0" key={getRowId(row)}>
                {renderCard(row)}
              </li>
            ))}
          </ul>
        ) : (
          !isInitialLoading && emptyContent
        )}
      </SkeletonReveal>
    </div>
  );
}
