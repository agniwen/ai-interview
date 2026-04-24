"use client";

import type { DepartmentRecord } from "@/lib/departments";
import type { InterviewerListRecord } from "@/lib/interviewers";
import type { JobDescriptionListRecord, JobDescriptionRecord } from "@/lib/job-descriptions";
import type { PaginatedJobDescriptionResult } from "@/server/queries/job-descriptions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  FileTextIcon,
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
import { JobDescriptionFormDialog } from "./job-description-form-dialog";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

async function fetchJobDescriptions(params: {
  search: string;
  departmentId: string;
  interviewerId: string;
  page: number;
  pageSize: number;
}): Promise<PaginatedJobDescriptionResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  if (params.departmentId !== "all") {
    qs.set("departmentId", params.departmentId);
  }
  if (params.interviewerId !== "all") {
    qs.set("interviewerId", params.interviewerId);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", "createdAt");
  qs.set("sortOrder", "desc");

  const response = await fetch(`/api/studio/job-descriptions?${qs.toString()}`);
  const payload = await response.json();
  if (!response.ok || !payload?.records) {
    throw new Error(payload?.error ?? "加载列表失败");
  }
  return payload as PaginatedJobDescriptionResult;
}

async function loadJobDescriptionDetail(id: string): Promise<JobDescriptionRecord | null> {
  const response = await fetch(`/api/studio/job-descriptions/${id}`);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as JobDescriptionRecord;
}

// oxlint-disable-next-line complexity -- Page hosts list, filter, pagination, and dialog state together.
export function JobDescriptionManagementPage({
  initialData,
  departments,
  interviewers,
}: {
  initialData: PaginatedJobDescriptionResult;
  departments: DepartmentRecord[];
  interviewers: InterviewerListRecord[];
}) {
  const queryClient = useQueryClient();
  const [globalFilter, setGlobalFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [interviewerFilter, setInterviewerFilter] = useState("all");
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const deferredSearch = useDeferredValue(globalFilter);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<JobDescriptionRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<JobDescriptionListRecord | null>(null);

  const queryKey = [
    "job-descriptions",
    deferredSearch.trim(),
    departmentFilter,
    interviewerFilter,
    page,
    pageSize,
  ] as const;

  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    queryClient.setQueryData(queryKey, initialData);
  }

  const { data = initialData, isFetching } = useQuery({
    placeholderData: (prev) => prev,
    queryFn: () =>
      fetchJobDescriptions({
        departmentId: departmentFilter,
        interviewerId: interviewerFilter,
        page,
        pageSize,
        search: deferredSearch.trim(),
      }),
    queryKey,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  const { records, total, totalPages } = data;

  const prevKey = useMemo(
    () => `${deferredSearch.trim()}::${departmentFilter}::${interviewerFilter}`,
    [deferredSearch, departmentFilter, interviewerFilter],
  );
  const [lastKey, setLastKey] = useState(prevKey);
  if (prevKey !== lastKey) {
    setLastKey(prevKey);
    if (page !== 1) {
      setPage(1);
    }
  }

  function invalidateList() {
    void queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
    void queryClient.invalidateQueries({ queryKey: ["interviewers"] });
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
  }

  function openCreate() {
    setEditingRecord(null);
    setFormDialogOpen(true);
  }

  async function openEdit(record: JobDescriptionListRecord) {
    const full = await loadJobDescriptionDetail(record.id);
    if (!full) {
      toast.error("加载在招岗位失败");
      return;
    }
    setEditingRecord(full);
    setFormDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    const response = await fetch(`/api/studio/job-descriptions/${deleteRecord.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      toast.error(payload?.error ?? "删除失败");
      return;
    }
    setDeleteRecord(null);
    toast.success("在招岗位已删除");
    invalidateList();
  }

  const startRow = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);
  const missingRefs = departments.length === 0 || interviewers.length === 0;

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">在招岗位管理</h1>
          <p className="text-muted-foreground text-sm">
            配置岗位描述 prompt，并指定面试时要启用的面试官。
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-3 sm:flex-1 sm:flex-row">
            <div className="relative sm:min-w-60 sm:flex-1" data-tour="studio-jobs-search">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pr-9 pl-9"
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder="搜索在招岗位名称或描述"
                value={globalFilter}
              />
              {isFetching ? (
                <Loader2Icon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <Select onValueChange={setDepartmentFilter} value={departmentFilter}>
              <SelectTrigger
                className="w-full sm:min-w-40 sm:w-auto"
                data-tour="studio-jobs-department-filter"
              >
                <SelectValue placeholder="按部门筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部部门</SelectItem>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select onValueChange={setInterviewerFilter} value={interviewerFilter}>
              <SelectTrigger
                className="w-full sm:min-w-48 sm:w-auto"
                data-tour="studio-jobs-interviewer-filter"
              >
                <SelectValue placeholder="按面试官筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部面试官</SelectItem>
                {interviewers.map((interviewer) => (
                  <SelectItem key={interviewer.id} value={interviewer.id}>
                    {interviewer.departmentName
                      ? `${interviewer.departmentName} / ${interviewer.name}`
                      : interviewer.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              data-tour="studio-jobs-create"
              disabled={missingRefs}
              onClick={openCreate}
              variant="outline"
            >
              <PlusIcon className="size-4" />
              新建在招岗位
            </Button>
          </div>
        </div>

        {missingRefs ? (
          <Empty className="border-border/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>请先创建部门和面试官</EmptyTitle>
              <EmptyDescription>
                在招岗位需要同时指定部门和面试官，先去对应页面完成配置。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {!missingRefs && records.length > 0 ? (
          <Card className="overflow-hidden py-0" data-tour="studio-jobs-table">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>岗位名称</TableHead>
                  <TableHead>部门</TableHead>
                  <TableHead>面试官</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.name}</TableCell>
                    <TableCell className="text-sm">
                      {record.departmentName ?? <Badge variant="outline">未知</Badge>}
                    </TableCell>
                    <TableCell className="text-sm">
                      {record.interviewers.length === 0 ? (
                        <Badge variant="outline">未配置</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {record.interviewers.slice(0, 3).map((item) => (
                            <Badge key={item.id} variant="secondary">
                              {item.name}
                            </Badge>
                          ))}
                          {record.interviewers.length > 3 ? (
                            <Badge variant="outline">+{record.interviewers.length - 3}</Badge>
                          ) : null}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm truncate text-muted-foreground text-sm">
                      {record.description || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={record.createdAt} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label="编辑岗位"
                              className="size-8"
                              onClick={() => void openEdit(record)}
                              size="icon"
                              variant="ghost"
                            >
                              <PencilIcon className="size-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>编辑岗位</TooltipContent>
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
        ) : null}
        {!missingRefs && records.length === 0 ? (
          <Empty className="border-border/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FileTextIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>还没有在招岗位</EmptyTitle>
              <EmptyDescription>
                创建在招岗位之后即可在面试记录中引用，并带上面试官 prompt 与音色。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={openCreate} variant="outline">
                <PlusIcon className="size-4" />
                新建在招岗位
              </Button>
            </EmptyContent>
          </Empty>
        ) : null}

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

      <JobDescriptionFormDialog
        departments={departments}
        interviewers={interviewers}
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
            <AlertDialogTitle>确认删除这个在招岗位？</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除岗位：{deleteRecord?.name ?? ""}，引用该岗位的面试记录的关联岗位字段会被清空。
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
