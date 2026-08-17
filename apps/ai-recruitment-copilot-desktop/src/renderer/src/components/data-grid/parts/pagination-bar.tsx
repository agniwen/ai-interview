import { DEFAULT_PAGE_SIZE_OPTIONS } from "@arc/shared/pagination";
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
import { cn } from "@arc/shared/utils";

export interface PaginationBarProps {
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  page: number;
  pageSize: number;
  pageSizeOptions?: readonly number[];
  total: number;
  totalPages: number;
}

type VisiblePage = number | "ellipsis-end" | "ellipsis-start";

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

export function PaginationBar({
  loading,
  onPageChange,
  onPageSizeChange,
  page,
  pageSize,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  total,
  totalPages,
}: PaginationBarProps) {
  if (total === 0) {
    return null;
  }

  const startRow = (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, total);
  const visiblePages = getVisiblePages(page, totalPages);

  return (
    <div className="flex flex-col items-stretch justify-between gap-3 px-2 sm:flex-row sm:items-center sm:gap-4">
      <p className="text-center text-muted-foreground text-sm tabular-nums sm:text-left">
        显示第 {startRow}–{endRow} 条，共 {total} 条记录
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">每页</span>
          <Select
            onValueChange={(value) => {
              if (value) {
                onPageSizeChange(Number(value));
              }
            }}
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
                className={cn(page <= 1 || loading ? "pointer-events-none opacity-50" : undefined)}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  if (page > 1 && !loading) {
                    onPageChange(page - 1);
                  }
                }}
              />
            </PaginationItem>
            {visiblePages.map((visiblePage) =>
              visiblePage === "ellipsis-start" || visiblePage === "ellipsis-end" ? (
                <PaginationItem key={visiblePage}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={visiblePage}>
                  <PaginationLink
                    aria-label={`第 ${visiblePage} 页`}
                    className={cn(loading ? "pointer-events-none opacity-50" : undefined)}
                    href="#"
                    isActive={visiblePage === page}
                    onClick={(event) => {
                      event.preventDefault();
                      if (!loading) {
                        onPageChange(visiblePage);
                      }
                    }}
                  >
                    {visiblePage}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                aria-label="下一页"
                className={cn(
                  page >= totalPages || loading ? "pointer-events-none opacity-50" : undefined,
                )}
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  if (page < totalPages && !loading) {
                    onPageChange(page + 1);
                  }
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
