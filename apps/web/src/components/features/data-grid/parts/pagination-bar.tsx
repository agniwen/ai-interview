import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@app/shared/utils";

export interface PaginationBarProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  pageSizeOptions: readonly number[];
  loading?: boolean;
  onPageChange: (p: number) => void;
  onPageSizeChange: (s: number) => void;
}

type VisiblePage = number | "ellipsis-start" | "ellipsis-end";

const PAGINATION_SKELETON_PAGES = 7;

function getVisiblePages(page: number, totalPages: number): VisiblePage[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  if (page <= 4) {
    return [1, 2, 3, 4, 5, "ellipsis-end", totalPages];
  }

  if (page >= totalPages - 3) {
    return [
      1,
      "ellipsis-start",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [1, "ellipsis-start", page - 1, page, page + 1, "ellipsis-end", totalPages];
}

export function PaginationBarSkeleton() {
  return (
    <output
      aria-label="正在加载分页信息"
      className="flex flex-col items-stretch justify-between gap-3 border-t px-3 py-2 text-sm sm:min-h-11 sm:flex-row sm:items-center sm:gap-4 sm:py-0.5"
      data-slot="pagination-bar-skeleton"
    >
      <Skeleton className="h-5 w-56 max-w-full self-center sm:self-auto" />
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-7" />
          <Skeleton className="h-8 w-[5.5rem]" />
        </div>
        <div className="flex w-full justify-center sm:w-auto">
          <div className="flex flex-row items-center gap-1">
            <Skeleton className="h-9 w-9 sm:w-20" />
            <Skeleton className="h-5 w-16 sm:hidden" data-slot="pagination-mobile-info-skeleton" />
            {Array.from({ length: PAGINATION_SKELETON_PAGES }, (_, index) => (
              <Skeleton className="hidden size-9 sm:block" key={index} />
            ))}
            <Skeleton className="h-9 w-9 sm:w-20" />
          </div>
        </div>
      </div>
    </output>
  );
}

export function PaginationBar(props: PaginationBarProps) {
  const {
    loading,
    onPageChange,
    onPageSizeChange,
    page,
    pageSize,
    pageSizeOptions,
    total,
    totalPages,
  } = props;

  if (total === 0) {
    return null;
  }

  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <div
      className="flex flex-col items-stretch justify-between gap-3 px-2 sm:flex-row sm:items-center sm:gap-4"
      data-slot="pagination-bar"
    >
      <p className="text-center text-muted-foreground text-sm tabular-nums sm:text-left">
        显示第 {startRow}–{endRow} 条，共 {total} 条记录
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">每页</span>
          <Select
            onValueChange={(value) => onPageSizeChange(Number(value))}
            value={String(pageSize)}
          >
            <SelectTrigger className="h-8 w-[5.5rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size} 条
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Pagination className="w-full sm:w-auto">
          <PaginationContent className="w-full justify-center sm:w-auto sm:justify-start">
            <PaginationItem>
              <PaginationPrevious
                aria-label="上一页"
                onClick={() => onPageChange(page - 1)}
                render={<Button disabled={page <= 1 || loading} variant="ghost" />}
              />
            </PaginationItem>
            <PaginationItem className="sm:hidden">
              <span
                className="flex min-w-16 justify-center text-muted-foreground text-sm tabular-nums"
                data-slot="pagination-mobile-info"
              >
                {page} / {totalPages}
              </span>
            </PaginationItem>
            {visiblePages.map((visiblePage) =>
              visiblePage === "ellipsis-start" || visiblePage === "ellipsis-end" ? (
                <PaginationItem className="max-sm:hidden" key={visiblePage}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem className="max-sm:hidden" key={visiblePage}>
                  <PaginationLink
                    aria-label={`第 ${visiblePage} 页`}
                    isActive={visiblePage === page}
                    onClick={() => onPageChange(visiblePage)}
                    render={
                      <Button
                        className={cn("hover:border-transparent", {
                          "border-border/80 bg-accent text-accent-foreground hover:border-border/80":
                            visiblePage === page,
                        })}
                        disabled={loading}
                        size="icon"
                        variant="ghost"
                      />
                    }
                  >
                    {visiblePage}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                aria-label="下一页"
                onClick={() => onPageChange(page + 1)}
                render={<Button disabled={page >= totalPages || loading} variant="ghost" />}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
