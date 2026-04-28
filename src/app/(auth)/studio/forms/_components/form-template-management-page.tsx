"use client";

import type {
  CandidateFormScope,
  CandidateFormTemplateListRecord,
  CandidateFormTemplateRecord,
} from "@/lib/candidate-forms";
import type { JobDescriptionListRecord } from "@/lib/job-descriptions";
import type { PaginatedCandidateFormTemplateResult } from "@/server/queries/candidate-forms";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardListIcon, InboxIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { CandidateFormTemplateEditorDialog } from "./form-template-editor-dialog";
import { CandidateFormTemplateSubmissionsDrawer } from "./form-template-submissions-drawer";

function scopeLabel(scope: CandidateFormScope) {
  return scope === "global" ? "全局" : "岗位绑定";
}

function fetchTemplates(params: {
  search: string;
  page: number;
  pageSize: number;
  filters: { scope: string; jobDescriptionId: string };
}): Promise<PaginatedCandidateFormTemplateResult> {
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
  return apiFetch<PaginatedCandidateFormTemplateResult>(`/api/studio/forms?${qs.toString()}`);
}

async function loadTemplateDetail(id: string): Promise<CandidateFormTemplateRecord | null> {
  const response = await fetch(`/api/studio/forms/${id}`);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as CandidateFormTemplateRecord;
}

// oxlint-disable-next-line complexity -- Page hosts list, filter, pagination, and dialog state together.
export function CandidateFormTemplateManagementPage({
  initialData,
  jobDescriptions,
}: {
  initialData: PaginatedCandidateFormTemplateResult;
  jobDescriptions: JobDescriptionListRecord[];
}) {
  const queryClient = useQueryClient();

  const grid = useDataGridState<
    CandidateFormTemplateListRecord,
    { scope: string; jobDescriptionId: string }
  >({
    fetcher: fetchTemplates,
    initialData,
    initialFilters: { jobDescriptionId: "all", scope: "all" },
    namespace: "candidate-form-templates",
  });

  // URL-bound drawer state — not a list filter; kept independent of DataGrid.
  const [activeTemplateId, setActiveTemplateId] = useQueryState(
    "templateId",
    parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
  );

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<CandidateFormTemplateRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<CandidateFormTemplateListRecord | null>(null);
  const [submissionsRecord, setSubmissionsRecord] =
    useState<CandidateFormTemplateListRecord | null>(null);

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
    void queryClient.invalidateQueries({ queryKey: ["candidate-form-templates"] });
  }

  function openCreate() {
    setEditingRecord(null);
    setEditorOpen(true);
  }

  async function openEdit(record: CandidateFormTemplateListRecord) {
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
    const response = await fetch(`/api/studio/forms/${deleteRecord.id}`, { method: "DELETE" });
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
      textColumn<CandidateFormTemplateListRecord>({
        key: "title",
        primary: true,
        secondary: (r) => r.description ?? undefined,
        title: "标题",
      }),
      customColumn<CandidateFormTemplateListRecord>({
        cell: (r) => (
          <Badge variant={r.scope === "global" ? "default" : "secondary"}>
            {scopeLabel(r.scope)}
          </Badge>
        ),
        key: "scope",
        title: "作用范围",
      }),
      customColumn<CandidateFormTemplateListRecord>({
        cell: (r) =>
          r.scope === "global"
            ? "—"
            : (r.jobDescriptionName ?? <Badge variant="outline">岗位已删除</Badge>),
        key: "jobDescriptionName",
        title: "绑定岗位",
      }),
      customColumn<CandidateFormTemplateListRecord>({
        cell: (r) => <span className="tabular-nums text-right block">{r.questionCount}</span>,
        key: "questionCount",
        title: "题目数",
      }),
      customColumn<CandidateFormTemplateListRecord>({
        cell: (r) =>
          r.submissionCount > 0 ? (
            <button
              className="text-primary text-sm underline-offset-4 hover:underline tabular-nums"
              onClick={() => setSubmissionsRecord(r)}
              type="button"
            >
              {r.submissionCount}
            </button>
          ) : (
            <span className="text-muted-foreground tabular-nums">0</span>
          ),
        key: "submissionCount",
        title: "已填写",
      }),
      dateColumn<CandidateFormTemplateListRecord>({
        key: "updatedAt",
        title: "更新时间",
      }),
      actionsColumn<CandidateFormTemplateListRecord>({
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
            icon: InboxIcon,
            label: "查看填写记录",
            onClick: (r) => setSubmissionsRecord(r),
          },
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
        placeholder: "搜索表单标题或说明",
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
          <h1 className="font-semibold text-2xl">面试表单</h1>
          <p className="text-muted-foreground text-sm">
            配置候选人在面试前需要填写的表单。可以设为全局或绑定到在招岗位；候选人提交后会冻结为快照，之后编辑不影响历史填写记录。
          </p>
        </header>

        <DataGrid<CandidateFormTemplateListRecord>
          {...grid.bind}
          columns={columns}
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            <Button
              className="flex-1 sm:flex-none"
              data-tour="studio-forms-create"
              onClick={openCreate}
              variant="outline"
            >
              <PlusIcon className="size-4" />
              新建面试表单
            </Button>
          }
          empty={
            <Empty className="border-border/60">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardListIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有面试表单</EmptyTitle>
                <EmptyDescription>
                  创建后，符合作用域的面试开始前，候选人会先被要求填写表单。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={openCreate} variant="outline">
                  <PlusIcon className="size-4" />
                  新建面试表单
                </Button>
              </EmptyContent>
            </Empty>
          }
          dataTour={{
            create: "studio-forms-create",
            filters: {
              jobDescriptionId: "studio-forms-jd-filter",
              scope: "studio-forms-scope-filter",
            },
            search: "studio-forms-search",
            table: "studio-forms-table",
          }}
        />
      </div>

      <CandidateFormTemplateEditorDialog
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

      <CandidateFormTemplateSubmissionsDrawer
        onOpenChange={(value) => !value && setSubmissionsRecord(null)}
        open={submissionsRecord !== null}
        template={submissionsRecord}
      />

      <AlertDialog
        onOpenChange={(value) => !value && setDeleteRecord(null)}
        open={deleteRecord !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这个面试表单？</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除：{deleteRecord?.title ?? ""}。 如果已有候选人填写过，将无法删除 ——
              请先清理相关面试记录。
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
