"use client";

import type { DepartmentListRecord, DepartmentRecord } from "@/lib/departments";
import type { PaginatedDepartmentResult } from "@/server/queries/departments";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Building2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DepartmentFormDialog } from "./department-form-dialog";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

async function fetchDepartments(params: {
  search: string;
  page: number;
  pageSize: number;
}): Promise<PaginatedDepartmentResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", "createdAt");
  qs.set("sortOrder", "desc");

  const response = await fetch(`/api/studio/departments?${qs.toString()}`);
  const payload = await response.json();

  if (!response.ok || !payload?.records) {
    throw new Error(payload?.error ?? "加载列表失败");
  }
  return payload as PaginatedDepartmentResult;
}

export function DepartmentManagementPage({
  initialData,
}: {
  initialData: PaginatedDepartmentResult;
}) {
  const queryClient = useQueryClient();
  const [globalFilter, setGlobalFilter] = useState("");
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const deferredSearch = useDeferredValue(globalFilter);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DepartmentRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<DepartmentListRecord | null>(null);

  const queryKey = ["departments", deferredSearch.trim(), page, pageSize] as const;

  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    queryClient.setQueryData(queryKey, initialData);
  }

  const { data = initialData, isFetching } = useQuery({
    placeholderData: (prev) => prev,
    queryFn: () =>
      fetchDepartments({
        page,
        pageSize,
        search: deferredSearch.trim(),
      }),
    queryKey,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  const { records, total, totalPages } = data;

  const prevKey = useMemo(() => deferredSearch.trim(), [deferredSearch]);
  const [lastKey, setLastKey] = useState(prevKey);
  if (prevKey !== lastKey) {
    setLastKey(prevKey);
    if (page !== 1) {
      setPage(1);
    }
  }

  function invalidateList() {
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
  }

  function openCreate() {
    setEditingRecord(null);
    setFormDialogOpen(true);
  }

  function openEdit(record: DepartmentListRecord) {
    setEditingRecord(record);
    setFormDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    const response = await fetch(`/api/studio/departments/${deleteRecord.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      toast.error(payload?.error ?? "删除失败");
      return;
    }
    setDeleteRecord(null);
    toast.success("部门已删除");
    invalidateList();
  }

  const startRow = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">部门管理</h1>
          <p className="text-muted-foreground text-sm">
            维护组织下的业务部门，作为面试官和在招岗位的分组维度。
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative sm:min-w-60 sm:flex-1" data-tour="studio-departments-search">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pr-9 pl-9"
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="搜索部门名称或描述"
              value={globalFilter}
            />
            {isFetching ? (
              <Loader2Icon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="shrink-0"
              disabled={isFetching}
              onClick={() => invalidateList()}
              size="icon"
              variant="outline"
            >
              <RefreshCwIcon className="size-4" />
              <span className="sr-only">刷新</span>
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              data-tour="studio-departments-create"
              onClick={openCreate}
              variant="outline"
            >
              <PlusIcon className="size-4" />
              新建部门
            </Button>
          </div>
        </div>

        {records.length > 0 ? (
          <Card className="overflow-hidden py-0" data-tour="studio-departments-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>部门名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>引用情况</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.name}</TableCell>
                    <TableCell className="max-w-sm truncate text-muted-foreground text-sm">
                      {record.description || "—"}
                    </TableCell>
                    <TableCell className="space-x-2 text-sm">
                      <Badge variant="outline">面试官 {record.interviewerCount}</Badge>
                      <Badge variant="outline">在招岗位 {record.jobDescriptionCount}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={record.createdAt} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label="编辑部门"
                              className="size-8"
                              onClick={() => openEdit(record)}
                              size="icon"
                              variant="ghost"
                            >
                              <PencilIcon className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>编辑部门</TooltipContent>
                        </Tooltip>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button
                              aria-label="更多操作"
                              className="size-8"
                              size="icon"
                              variant="ghost"
                            >
                              <MoreHorizontalIcon className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel>更多操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => setDeleteRecord(record)}
                              variant="destructive"
                            >
                              <Trash2Icon className="size-4" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        ) : (
          <Empty className="border-border/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2Icon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>还没有部门</EmptyTitle>
              <EmptyDescription>
                创建部门之后可以把面试官和在招岗位组织起来，面试时按部门挑选配置。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={openCreate} variant="outline">
                <PlusIcon className="size-4" />
                新建部门
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {total > 0 ? (
          <div className="flex flex-col items-center justify-between gap-4 px-2 sm:flex-row">
            <p className="text-muted-foreground text-sm tabular-nums">
              显示第 {startRow}–{endRow} 条，共 {total} 条记录
            </p>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-sm">每页</span>
                <Select
                  onValueChange={(value) => {
                    setPageSize(Number(value));
                    setPage(1);
                  }}
                  value={String(pageSize)}
                >
                  <SelectTrigger className="h-8 w-[5.5rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size} 条
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <span className="text-muted-foreground text-sm tabular-nums">
                第 {page} / {totalPages} 页
              </span>
              <div className="flex items-center gap-1">
                <Button
                  aria-label="第一页"
                  className="size-8"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage(1)}
                  size="icon"
                  variant="outline"
                >
                  <ChevronsLeftIcon className="size-4" />
                </Button>
                <Button
                  aria-label="上一页"
                  className="size-8"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage(page - 1)}
                  size="icon"
                  variant="outline"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <Button
                  aria-label="下一页"
                  className="size-8"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage(page + 1)}
                  size="icon"
                  variant="outline"
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
                <Button
                  aria-label="最后一页"
                  className="size-8"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage(totalPages)}
                  size="icon"
                  variant="outline"
                >
                  <ChevronsRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <DepartmentFormDialog
        onOpenChange={(value) => {
          setFormDialogOpen(value);
          if (!value) {
            setEditingRecord(null);
          }
        }}
        onSaved={() => invalidateList()}
        open={formDialogOpen}
        record={editingRecord}
      />

      <AlertDialog
        onOpenChange={(value) => !value && setDeleteRecord(null)}
        open={deleteRecord !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这个部门？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRecord &&
              (deleteRecord.interviewerCount > 0 || deleteRecord.jobDescriptionCount > 0)
                ? "该部门下仍有面试官或在招岗位，将无法删除。"
                : `即将删除部门：${deleteRecord?.name ?? ""}，删除后无法恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
