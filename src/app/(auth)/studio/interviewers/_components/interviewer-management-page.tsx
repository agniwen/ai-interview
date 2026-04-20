"use client";

import type { DepartmentRecord } from "@/lib/departments";
import type { InterviewerListRecord, InterviewerRecord } from "@/lib/interviewers";
import type { PaginatedInterviewerResult } from "@/server/queries/interviewers";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
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
  UserCircleIcon,
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
import { getMinimaxVoiceMeta } from "@/lib/minimax-voices";
import { InterviewerFormDialog } from "./interviewer-form-dialog";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

async function fetchInterviewers(params: {
  search: string;
  departmentId: string;
  page: number;
  pageSize: number;
}): Promise<PaginatedInterviewerResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  if (params.departmentId !== "all") {
    qs.set("departmentId", params.departmentId);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", "createdAt");
  qs.set("sortOrder", "desc");

  const response = await fetch(`/api/studio/interviewers?${qs.toString()}`);
  const payload = await response.json();
  if (!response.ok || !payload?.records) {
    throw new Error(payload?.error ?? "加载列表失败");
  }
  return payload as PaginatedInterviewerResult;
}

async function loadInterviewerDetail(id: string): Promise<InterviewerRecord | null> {
  const response = await fetch(`/api/studio/interviewers/${id}`);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as InterviewerRecord;
}

// oxlint-disable-next-line complexity -- Page hosts list, filter, pagination, and dialog state together.
export function InterviewerManagementPage({
  initialData,
  departments,
}: {
  initialData: PaginatedInterviewerResult;
  departments: DepartmentRecord[];
}) {
  const queryClient = useQueryClient();
  const [globalFilter, setGlobalFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const deferredSearch = useDeferredValue(globalFilter);

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InterviewerRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<InterviewerListRecord | null>(null);

  const queryKey = [
    "interviewers",
    deferredSearch.trim(),
    departmentFilter,
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
      fetchInterviewers({
        departmentId: departmentFilter,
        page,
        pageSize,
        search: deferredSearch.trim(),
      }),
    queryKey,
  });

  const { records, total, totalPages } = data;

  const prevKey = useMemo(
    () => `${deferredSearch.trim()}::${departmentFilter}`,
    [deferredSearch, departmentFilter],
  );
  const [lastKey, setLastKey] = useState(prevKey);
  if (prevKey !== lastKey) {
    setLastKey(prevKey);
    if (page !== 1) {
      setPage(1);
    }
  }

  function invalidateList() {
    void queryClient.invalidateQueries({ queryKey: ["interviewers"] });
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
  }

  function openCreate() {
    setEditingRecord(null);
    setFormDialogOpen(true);
  }

  async function openEdit(record: InterviewerListRecord) {
    const full = await loadInterviewerDetail(record.id);
    if (!full) {
      toast.error("加载面试官失败");
      return;
    }
    setEditingRecord(full);
    setFormDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    const response = await fetch(`/api/studio/interviewers/${deleteRecord.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      toast.error(payload?.error ?? "删除失败");
      return;
    }
    setDeleteRecord(null);
    toast.success("面试官已删除");
    invalidateList();
  }

  const startRow = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);
  const noDepartments = departments.length === 0;

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">面试官管理</h1>
          <p className="text-muted-foreground text-sm">
            配置 AI 面试官的 prompt 和 TTS 音色，JD 会引用这些面试官。
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-60">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pr-9 pl-9"
              onChange={(event) => setGlobalFilter(event.target.value)}
              placeholder="搜索名称或描述"
              value={globalFilter}
            />
            {isFetching ? (
              <Loader2Icon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            ) : null}
          </div>
          <Select onValueChange={setDepartmentFilter} value={departmentFilter}>
            <SelectTrigger className="min-w-45">
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
          <Button
            disabled={isFetching}
            onClick={() => invalidateList()}
            size="icon"
            variant="outline"
          >
            <RefreshCwIcon className="size-4" />
            <span className="sr-only">刷新</span>
          </Button>
          <Button disabled={noDepartments} onClick={openCreate}>
            <PlusIcon className="size-4" />
            新建面试官
          </Button>
        </div>

        {noDepartments ? (
          <Empty className="border-border/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserCircleIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>请先创建部门</EmptyTitle>
              <EmptyDescription>
                面试官必须挂在某个部门下，先去「部门管理」创建一个部门。
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {!noDepartments && records.length > 0 ? (
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>所属部门</TableHead>
                  <TableHead>音色</TableHead>
                  <TableHead>引用 JD</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => {
                  const voiceMeta = getMinimaxVoiceMeta(record.voice);
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="min-w-0">
                          <p className="truncate font-medium">{record.name}</p>
                          <p className="truncate text-muted-foreground text-xs">
                            {record.description || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {record.departmentName ?? <Badge variant="outline">未知</Badge>}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground text-sm">
                            {voiceMeta?.label ?? record.voice}
                          </span>
                          <span className="truncate">{voiceMeta?.description ?? ""}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{record.jobDescriptionCount}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={record.createdAt} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu modal={false}>
                          <DropdownMenuTrigger asChild>
                            <Button className="size-8 p-0" variant="ghost">
                              <MoreHorizontalIcon className="size-4" />
                              <span className="sr-only">打开操作菜单</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuLabel>操作</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => void openEdit(record)}>
                              <PencilIcon className="size-4" />
                              编辑
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() => setDeleteRecord(record)}
                              variant="destructive"
                            >
                              <Trash2Icon className="size-4" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        ) : null}
        {!noDepartments && records.length === 0 ? (
          <Empty className="border-border/60">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <UserCircleIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>还没有面试官</EmptyTitle>
              <EmptyDescription>
                新建一个面试官，配置 prompt 和音色后即可供 JD 引用。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={openCreate}>
                <PlusIcon className="size-4" />
                新建面试官
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

      <InterviewerFormDialog
        departments={departments}
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
            <AlertDialogTitle>确认删除这个面试官？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRecord && deleteRecord.jobDescriptionCount > 0
                ? "该面试官仍被 JD 引用，将无法删除。"
                : `即将删除面试官：${deleteRecord?.name ?? ""}，删除后无法恢复。`}
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
