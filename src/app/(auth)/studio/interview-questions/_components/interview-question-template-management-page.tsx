"use client";

import type {
  InterviewQuestionTemplateListRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@/lib/interview-question-templates";
import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import type { PaginatedInterviewQuestionTemplateResult } from "@/server/queries/interview-question-templates";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ListChecksIcon,
  Loader2Icon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
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
import { InterviewQuestionTemplateEditorDialog } from "./interview-question-template-editor-dialog";

const PAGE_SIZE_OPTIONS = [5, 10, 20, 50] as const;

function scopeLabel(scope: InterviewQuestionTemplateScope) {
  return scope === "global" ? "全局" : "岗位绑定";
}

async function fetchTemplates(params: {
  search: string;
  scope: string;
  jobDescriptionId: string;
  page: number;
  pageSize: number;
}): Promise<PaginatedInterviewQuestionTemplateResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  if (params.scope !== "all") {
    qs.set("scope", params.scope);
  }
  if (params.jobDescriptionId !== "all") {
    qs.set("jobDescriptionId", params.jobDescriptionId);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", "createdAt");
  qs.set("sortOrder", "desc");
  const response = await fetch(`/api/studio/interview-questions?${qs.toString()}`);
  const payload = await response.json();
  if (!response.ok || !payload?.records) {
    throw new Error(payload?.error ?? "加载面试题列表失败");
  }
  return payload as PaginatedInterviewQuestionTemplateResult;
}

async function loadTemplateDetail(id: string): Promise<InterviewQuestionTemplateRecord | null> {
  const response = await fetch(`/api/studio/interview-questions/${id}`);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as InterviewQuestionTemplateRecord;
}

// oxlint-disable-next-line complexity -- Page hosts list, filter, pagination, and dialog state together.
export function InterviewQuestionTemplateManagementPage({
  initialData,
  jobDescriptions,
}: {
  initialData: PaginatedInterviewQuestionTemplateResult;
  jobDescriptions: JobDescriptionListRecord[];
}) {
  const queryClient = useQueryClient();
  const [globalFilter, setGlobalFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("all");
  // URL-bound filters — keeps deep links from "在招岗位 → 面试题" tab in sync.
  const [jobDescriptionFilter, setJobDescriptionFilter] = useQueryState(
    "jobDescriptionId",
    parseAsString.withDefault("all").withOptions({ clearOnDefault: true }),
  );
  const [activeTemplateId, setActiveTemplateId] = useQueryState(
    "templateId",
    parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
  );
  const [page, setPage] = useState(initialData.page);
  const [pageSize, setPageSize] = useState(initialData.pageSize);
  const deferredSearch = useDeferredValue(globalFilter);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InterviewQuestionTemplateRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<InterviewQuestionTemplateListRecord | null>(
    null,
  );

  const queryKey = [
    "interview-question-templates",
    deferredSearch.trim(),
    scopeFilter,
    jobDescriptionFilter,
    page,
    pageSize,
  ] as const;

  // Seed the SSR payload into its matching key (no filters), independent of
  // the current `queryKey`. If the URL carries `?jobDescriptionId=...`, the
  // live key differs from the seed → react-query fetches fresh filtered data
  // instead of falsely reusing the unfiltered initialData.
  const seededRef = useRef(false);
  if (!seededRef.current) {
    seededRef.current = true;
    const defaultKey = [
      "interview-question-templates",
      "",
      "all",
      "all",
      initialData.page,
      initialData.pageSize,
    ] as const;
    queryClient.setQueryData(defaultKey, initialData);
  }

  const { data = initialData, isFetching } = useQuery({
    placeholderData: (prev) => prev,
    queryFn: () =>
      fetchTemplates({
        jobDescriptionId: jobDescriptionFilter,
        page,
        pageSize,
        scope: scopeFilter,
        search: deferredSearch.trim(),
      }),
    queryKey,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });

  const { records, total, totalPages } = data;

  const prevKey = useMemo(
    () => `${deferredSearch.trim()}::${scopeFilter}::${jobDescriptionFilter}`,
    [deferredSearch, scopeFilter, jobDescriptionFilter],
  );
  const [lastKey, setLastKey] = useState(prevKey);
  if (prevKey !== lastKey) {
    setLastKey(prevKey);
    if (page !== 1) {
      setPage(1);
    }
  }

  // When the URL carries `?templateId=...` (e.g. clicked from the JD dialog),
  // load the detail and pop the editor open.
  const lastLoadedTemplateRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeTemplateId || lastLoadedTemplateRef.current === activeTemplateId) {
      return;
    }
    lastLoadedTemplateRef.current = activeTemplateId;
    let cancelled = false;
    void (async () => {
      const detail = await loadTemplateDetail(activeTemplateId);
      if (cancelled) {
        return;
      }
      if (!detail) {
        toast.error("加载模版失败");
        void setActiveTemplateId(null);
        lastLoadedTemplateRef.current = null;
        return;
      }
      setEditingRecord(detail);
      setEditorOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTemplateId, setActiveTemplateId]);

  function invalidateList() {
    void queryClient.invalidateQueries({ queryKey: ["interview-question-templates"] });
  }

  function openCreate() {
    setEditingRecord(null);
    setEditorOpen(true);
  }

  async function openEdit(record: InterviewQuestionTemplateListRecord) {
    const full = await loadTemplateDetail(record.id);
    if (!full) {
      toast.error("加载模版失败");
      return;
    }
    setEditingRecord(full);
    setEditorOpen(true);
  }

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    const response = await fetch(`/api/studio/interview-questions/${deleteRecord.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      toast.error(payload?.error ?? "删除失败");
      return;
    }
    setDeleteRecord(null);
    toast.success("模版已删除");
    invalidateList();
  }

  const startRow = total > 0 ? (page - 1) * pageSize + 1 : 0;
  const endRow = Math.min(page * pageSize, total);

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">面试题</h1>
          <p className="text-muted-foreground text-sm">
            配置面试官在面试中向候选人必问的题目。可以设为全局或绑定到在招岗位；面试创建时会冻结当前题目快照，之后编辑不影响已开始的面试。
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex flex-col gap-3 sm:flex-1 sm:flex-row">
            <div className="relative sm:min-w-60 sm:flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pr-9 pl-9"
                onChange={(event) => setGlobalFilter(event.target.value)}
                placeholder="搜索模版标题或说明"
                value={globalFilter}
              />
              {isFetching ? (
                <Loader2Icon className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <Select onValueChange={setScopeFilter} value={scopeFilter}>
              <SelectTrigger className="w-full sm:min-w-36 sm:w-auto">
                <SelectValue placeholder="按作用范围" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部作用域</SelectItem>
                <SelectItem value="global">全局</SelectItem>
                <SelectItem value="job_description">岗位绑定</SelectItem>
              </SelectContent>
            </Select>
            <Select onValueChange={setJobDescriptionFilter} value={jobDescriptionFilter}>
              <SelectTrigger className="w-full sm:min-w-48 sm:w-auto">
                <SelectValue placeholder="按岗位筛选" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部岗位</SelectItem>
                {jobDescriptions.map((jd) => (
                  <SelectItem key={jd.id} value={jd.id}>
                    {jd.name}
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
            <Button className="flex-1 sm:flex-none" onClick={openCreate} variant="outline">
              <PlusIcon className="size-4" />
              新建面试题
            </Button>
          </div>
        </div>

        {records.length > 0 ? (
          <Card className="overflow-hidden py-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>标题</TableHead>
                  <TableHead>作用范围</TableHead>
                  <TableHead>绑定岗位</TableHead>
                  <TableHead className="text-right">题目数</TableHead>
                  <TableHead className="text-right">已绑定面试</TableHead>
                  <TableHead>更新时间</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{record.title}</span>
                        {record.description ? (
                          <span className="truncate text-muted-foreground text-xs max-w-sm">
                            {record.description}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={record.scope === "global" ? "default" : "secondary"}>
                        {scopeLabel(record.scope)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {record.scope === "global"
                        ? "—"
                        : (record.jobDescriptionName ?? (
                            <Badge variant="outline">岗位已删除</Badge>
                          ))}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {record.questionCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {record.bindingCount > 0 ? (
                        record.bindingCount
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={record.updatedAt} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          aria-label="编辑模版"
                          className="size-8"
                          onClick={() => void openEdit(record)}
                          size="icon"
                          variant="ghost"
                        >
                          <PencilIcon className="size-4" />
                        </Button>
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
                <ListChecksIcon className="size-5" />
              </EmptyMedia>
              <EmptyTitle>还没有面试题</EmptyTitle>
              <EmptyDescription>
                创建后，符合作用域的面试在创建时会自动绑定到最新版本的题目快照。
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={openCreate} variant="outline">
                <PlusIcon className="size-4" />
                新建面试题
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
                  className="h-8"
                  disabled={page <= 1 || isFetching}
                  onClick={() => setPage(page - 1)}
                  size="sm"
                  variant="outline"
                >
                  上一页
                </Button>
                <Button
                  className="h-8"
                  disabled={page >= totalPages || isFetching}
                  onClick={() => setPage(page + 1)}
                  size="sm"
                  variant="outline"
                >
                  下一页
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <InterviewQuestionTemplateEditorDialog
        jobDescriptions={jobDescriptions}
        onOpenChange={(value) => {
          setEditorOpen(value);
          if (!value) {
            setEditingRecord(null);
            lastLoadedTemplateRef.current = null;
            void setActiveTemplateId(null);
          }
        }}
        onSaved={() => invalidateList()}
        open={editorOpen}
        record={editingRecord}
      />

      <AlertDialog
        onOpenChange={(value) => !value && setDeleteRecord(null)}
        open={deleteRecord !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这组面试题？</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除：{deleteRecord?.title ?? ""}。 如果已被某个面试绑定，将无法删除。
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
