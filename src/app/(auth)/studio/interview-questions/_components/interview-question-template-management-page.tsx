"use client";

import type {
  InterviewQuestionTemplateListRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@/lib/interview-question-templates";
import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import type { PaginatedInterviewQuestionTemplateResult } from "@/server/queries/interview-question-templates";
import { useQueryClient } from "@tanstack/react-query";
import { ListChecksIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  textColumn,
  useDataGridState,
} from "@/components/data-grid";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { apiFetch } from "@/lib/api";
import { InterviewQuestionTemplateEditorDialog } from "./interview-question-template-editor-dialog";

function scopeLabel(scope: InterviewQuestionTemplateScope) {
  return scope === "global" ? "全局" : "岗位绑定";
}

function fetchTemplates(params: {
  search: string;
  page: number;
  pageSize: number;
  filters: { scope: string; jobDescriptionId: string };
}): Promise<PaginatedInterviewQuestionTemplateResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  if (params.filters.scope !== "all") {
    qs.set("scope", params.filters.scope);
  }
  if (params.filters.jobDescriptionId !== "all") {
    qs.set("jobDescriptionId", params.filters.jobDescriptionId);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", "createdAt");
  qs.set("sortOrder", "desc");
  return apiFetch<PaginatedInterviewQuestionTemplateResult>(
    `/api/studio/interview-questions?${qs.toString()}`,
  );
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

  const grid = useDataGridState<
    InterviewQuestionTemplateListRecord,
    { scope: string; jobDescriptionId: string }
  >({
    fetcher: fetchTemplates,
    initialData,
    initialFilters: { jobDescriptionId: "all", scope: "all" },
    namespace: "interview-question-templates",
  });

  // URL-bound drawer state — not a list filter; kept independent of DataGrid.
  const [activeTemplateId, setActiveTemplateId] = useQueryState(
    "templateId",
    parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InterviewQuestionTemplateRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<InterviewQuestionTemplateListRecord | null>(
    null,
  );

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

  function invalidateAll() {
    grid.invalidate();
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
    invalidateAll();
  }

  const columns = useMemo(
    () => [
      textColumn<InterviewQuestionTemplateListRecord>({
        key: "title",
        primary: true,
        secondary: (r) => r.description ?? undefined,
        title: "标题",
      }),
      customColumn<InterviewQuestionTemplateListRecord>({
        cell: (r) => (
          <Badge variant={r.scope === "global" ? "default" : "secondary"}>
            {scopeLabel(r.scope)}
          </Badge>
        ),
        key: "scope",
        title: "作用范围",
      }),
      customColumn<InterviewQuestionTemplateListRecord>({
        cell: (r) =>
          r.scope === "global"
            ? "—"
            : (r.jobDescriptionName ?? <Badge variant="outline">岗位已删除</Badge>),
        key: "jobDescriptionName",
        title: "绑定岗位",
      }),
      customColumn<InterviewQuestionTemplateListRecord>({
        cell: (r) => <span className="tabular-nums text-right block">{r.questionCount}</span>,
        key: "questionCount",
        title: "题目数",
      }),
      customColumn<InterviewQuestionTemplateListRecord>({
        cell: (r) =>
          r.bindingCount > 0 ? (
            <span className="tabular-nums">{r.bindingCount}</span>
          ) : (
            <span className="text-muted-foreground tabular-nums">0</span>
          ),
        key: "bindingCount",
        title: "已绑定面试",
      }),
      dateColumn<InterviewQuestionTemplateListRecord>({
        key: "updatedAt",
        title: "更新时间",
      }),
      actionsColumn<InterviewQuestionTemplateListRecord>({
        inline: [
          {
            icon: PencilIcon,
            label: "编辑模版",
            onClick: (r) => {
              void openEdit(r);
            },
          },
        ],
        menu: [
          {
            icon: Trash2Icon,
            label: "删除",
            onClick: (r) => setDeleteRecord(r),
            variant: "destructive",
          },
        ],
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索模版标题或说明",
        type: "search" as const,
      },
      {
        key: "scope" as const,
        options: [
          { label: "全部作用域", value: "all" },
          { label: "全局", value: "global" },
          { label: "岗位绑定", value: "job_description" },
        ],
        placeholder: "按作用范围",
        type: "select" as const,
      },
      {
        key: "jobDescriptionId" as const,
        options: [
          { label: "全部岗位", value: "all" },
          ...jobDescriptions.map((jd) => ({ label: jd.name, value: jd.id })),
        ],
        placeholder: "按岗位筛选",
        type: "select" as const,
      },
    ],
    [jobDescriptions],
  );

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">面试题</h1>
          <p className="text-muted-foreground text-sm">
            配置面试官在面试中向候选人必问的题目。可以设为全局或绑定到在招岗位；面试创建时会冻结当前题目快照，之后编辑不影响已开始的面试。
          </p>
        </header>

        <DataGrid<InterviewQuestionTemplateListRecord>
          {...grid.bind}
          columns={columns}
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            <Button className="flex-1 sm:flex-none" onClick={openCreate} variant="outline">
              <PlusIcon className="size-4" />
              新建面试题
            </Button>
          }
          empty={
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
          }
        />
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
        onSaved={() => invalidateAll()}
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
