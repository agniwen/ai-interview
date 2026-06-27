import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  const startRow = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col items-stretch justify-between gap-3 px-2 sm:flex-row sm:items-center sm:gap-4">
      <p className="text-center text-muted-foreground text-sm tabular-nums sm:text-left">
        显示第 {startRow}–{endRow} 条，共 {total} 条记录
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4">
        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-start sm:gap-4">
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

          <span className="shrink-0 text-muted-foreground text-sm tabular-nums">
            第 {page} / {totalPages} 页
          </span>
        </div>

        <div className="flex w-full justify-center gap-1 sm:w-auto sm:justify-start">
          <Button
            aria-label="第一页"
            className="size-8"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(1)}
            size="icon"
            variant="outline"
          >
            <IconChevronsLeft className="size-4" />
          </Button>
          <Button
            aria-label="上一页"
            className="size-8"
            disabled={page <= 1 || loading}
            onClick={() => onPageChange(page - 1)}
            size="icon"
            variant="outline"
          >
            <IconChevronLeft className="size-4" />
          </Button>
          <Button
            aria-label="下一页"
            className="size-8"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(page + 1)}
            size="icon"
            variant="outline"
          >
            <IconChevronRight className="size-4" />
          </Button>
          <Button
            aria-label="最后一页"
            className="size-8"
            disabled={page >= totalPages || loading}
            onClick={() => onPageChange(totalPages)}
            size="icon"
            variant="outline"
          >
            <IconChevronsRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
