import { HydrationBoundary, useQueryClient } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import {
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
  useNavigate,
  useSearch,
} from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { loadStudioFormsState } from "@/lib/start/studio/forms.functions";
import type { StudioFormsState } from "@/lib/start/studio/forms.functions";
import { PageHeader } from "@/components/features/studio/page-header";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import type {
  CandidateFormScope,
  CandidateFormTemplateInput,
  CandidateFormTemplateListRecord,
  CandidateFormTemplateRecord,
} from "@arc/db-schema/candidate-forms";
import type { PaginatedCandidateFormTemplateResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/forms/dao/queries";
import { ChevronDownIcon, ClipboardListIcon, PlusIcon, SparklesIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { CandidateFormTemplateEditorDialog } from "@/components/features/studio/forms/form-template-editor-dialog";
import { FormTemplateAiCreateDialog } from "@/components/features/studio/forms/form-template-ai-create-dialog";
import { CandidateFormTemplateSubmissionsDrawer } from "@/components/features/studio/forms/form-template-submissions-drawer";

function scopeLabel(scope: CandidateFormScope) {
  return scope === "global" ? "全局" : "岗位绑定";
}

function archivedFilterLabelOf(value: "active" | "archived" | "all"): string {
  if (value === "archived") {
    return "已归档";
  }
  if (value === "all") {
    return "全部";
  }
  return "未归档";
}

function firstSearchValue(value: unknown): string {
  if (Array.isArray(value)) {
    const [first] = value;
    return first === undefined ? "" : String(first);
  }
  return value === undefined ? "" : String(value);
}

// oxlint-disable-next-line complexity -- Page hosts list, filter, pagination, and dialog state together.
function CandidateFormTemplateManagementPage({
  jobDescriptions,
}: {
  jobDescriptions: JobDescriptionListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

  const fetchTemplates = useMemo(
    () =>
      async (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: { scope: string; jobDescriptionId: string; archivedFilter: string };
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }): Promise<PaginatedCandidateFormTemplateResult> => {
        const res = await rpc.api.w[":slug"].studio.forms.$get({
          param: { slug },
          query: {
            page: String(params.page),
            pageSize: String(params.pageSize),
            ...(params.search ? { search: params.search } : {}),
            // 多选过滤：CSV 形式 / Multi-select filters: CSV serialization.
            ...(params.filters.scope ? { scope: params.filters.scope } : {}),
            ...(params.filters.jobDescriptionId
              ? { jobDescriptionId: params.filters.jobDescriptionId }
              : {}),
            // archivedFilter 走 DataGrid 的 filter 通道，自动进入 queryKey，
            // 切换时 react-query 才会重新拉取（避免列表不刷新的 bug）。
            // Archived filter goes through the DataGrid filter channel so it's
            // part of the queryKey and changes trigger a fresh fetch.
            ...(params.filters.archivedFilter === "active"
              ? {}
              : { archived: params.filters.archivedFilter }),
            sortBy: params.sortBy ?? "createdAt",
            sortOrder: params.sortOrder ?? "desc",
          },
        });
        if (!res.ok) {
          throw new Error("加载面试表单列表失败");
        }
        return (await res.json()) as PaginatedCandidateFormTemplateResult;
      },
    [slug],
  );

  const loadTemplateDetailById = useCallback(
    async (id: string): Promise<CandidateFormTemplateRecord | null> => {
      const response = await rpc.api.w[":slug"].studio.forms[":id"].$get({
        param: { id, slug },
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as CandidateFormTemplateRecord;
    },
    [slug],
  );

  const grid = useDataGridState<
    CandidateFormTemplateListRecord,
    { scope: string; jobDescriptionId: string; archivedFilter: string }
  >({
    allowedSortIds: ["createdAt", "title", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { archivedFilter: "active", jobDescriptionId: "", scope: "" },
    queryFn: fetchTemplates,
    queryKeyBase: ["candidate-form-templates", slug],
  });
  const archivedFilter = (grid.filters.archivedFilter as "active" | "archived" | "all") || "active";
  const archivedFilterLabel = archivedFilterLabelOf(archivedFilter);

  const routeSearch = useSearch({ from: "/w/$slug/studio/forms" }) as SearchParamsRecord;
  const navigate = useNavigate({ from: "/w/$slug/studio/forms" });
  const activeTemplateId = firstSearchValue(routeSearch.templateId);
  const setActiveTemplateId = useCallback(
    (value: string | null) => {
      void navigate({
        replace: true,
        resetScroll: false,
        search: (prev: SearchParamsRecord) => {
          const next = { ...prev };
          if (value) {
            next.templateId = value;
          } else {
            delete next.templateId;
          }
          return next;
        },
      });
    },
    [navigate],
  );

  const crud = useEntityCrud<CandidateFormTemplateListRecord, CandidateFormTemplateRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio.forms[":id"].$delete({ param: { id: record.id, slug } }),
    invalidate: () => {
      grid.invalidate();
      void queryClient.invalidateQueries({ queryKey: ["candidate-form-templates"] });
    },
    loadDetail: (record) => loadTemplateDetailById(record.id),
    messages: {
      // 实际是软删除（归档）：后端 DELETE 现在把 archivedAt 写为当前时间。
      // Backend DELETE is now soft (set archivedAt); reword the toast.
      deleteSuccess: "表单已归档",
      loadDetailError: "加载模版失败",
    },
  });

  const unarchiveTemplate = useCallback(
    async (record: CandidateFormTemplateListRecord) => {
      const res = await rpc.api.w[":slug"].studio.forms[":id"].unarchive.$post({
        param: { id: record.id, slug },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "取消归档失败");
        return;
      }
      toast.success("表单已取消归档");
      grid.invalidate();
      void queryClient.invalidateQueries({ queryKey: ["candidate-form-templates"] });
    },
    [grid, queryClient, slug],
  );

  const [submissionsRecord, setSubmissionsRecord] =
    useState<CandidateFormTemplateListRecord | null>(null);
  const [createDraft, setCreateDraft] = useState<CandidateFormTemplateInput | null>(null);
  const [createDraftSessionId, setCreateDraftSessionId] = useState(0);
  const [aiCreateOpen, setAiCreateOpen] = useState(false);

  // When the URL carries `?templateId=...` (e.g. clicked from the JD dialog),
  // load the detail and pop the editor open.
  const lastLoadedTemplateRef = useRef<string | null>(null);
  const { setEditingRecord, setFormDialogOpen } = crud;
  useEffect(() => {
    if (!activeTemplateId || lastLoadedTemplateRef.current === activeTemplateId) {
      return;
    }
    lastLoadedTemplateRef.current = activeTemplateId;
    let cancelled = false;
    void (async () => {
      const detail = await loadTemplateDetailById(activeTemplateId);
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
      setFormDialogOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [
    activeTemplateId,
    loadTemplateDetailById,
    setActiveTemplateId,
    setEditingRecord,
    setFormDialogOpen,
  ]);

  function onEditorOpenChange(next: boolean) {
    crud.onFormOpenChange(next);
    if (!next) {
      lastLoadedTemplateRef.current = null;
      setCreateDraft(null);
      void setActiveTemplateId(null);
    }
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
        cell: (r) =>
          r.archivedAt ? (
            <Badge variant="outline">已归档</Badge>
          ) : (
            <Badge variant="success">使用中</Badge>
          ),
        key: "archivedAt",
        title: "状态",
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
        cell: (r) => {
          if (r.scope === "global") {
            return "—";
          }
          if (r.jobDescriptions.length === 0) {
            return <Badge variant="outline">岗位已删除</Badge>;
          }
          // 最多展示 12 个 badge，多余的折叠成 "+N"。
          // 12 是经验值：DataGrid 行高有限，再多挤进来会换 4-5 行视觉太重；
          // hover 在尾部 badge 上能看到全名提示，要看完整列表可以点编辑进表单详情。
          // Cap at 12 badges; the rest collapses into a "+N" pill. 12 keeps the
          // row height bounded — more would push the table into 4-5 lines per
          // row, which crushes the rhythm. The full list is still reachable
          // through the edit dialog.
          const VISIBLE_LIMIT = 12;
          const visible = r.jobDescriptions.slice(0, VISIBLE_LIMIT);
          const overflow = r.jobDescriptions.length - VISIBLE_LIMIT;
          return (
            <div className="flex flex-wrap gap-1">
              {visible.map((jd) => (
                <Badge key={jd.id} variant="secondary">
                  {jd.name}
                </Badge>
              ))}
              {overflow > 0 ? (
                <Badge title={`还有 ${overflow} 个岗位未展示`} variant="outline">
                  +{overflow}
                </Badge>
              ) : null}
            </div>
          );
        },
        key: "jobDescriptions",
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
            label: "编辑",
            onClick: (r) => {
              void crud.openEdit(r);
            },
          },
        ],
        // 行的归档态决定显示「归档」还是「取消归档」；show 回调按状态二选一。
        // The row's archived state picks one of the two: archive vs unarchive.
        menu: [
          {
            label: "查看填写记录",
            onClick: (r) => setSubmissionsRecord(r),
          },
          {
            label: "归档",
            onClick: (r) => crud.setDeleteRecord(r),
            show: (r) => !r.archivedAt,
            variant: "destructive",
          },
          {
            label: "取消归档",
            onClick: (r) => void unarchiveTemplate(r),
            show: (r) => Boolean(r.archivedAt),
          },
        ],
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps
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
          { label: "全局", value: "global" },
          { label: "岗位绑定", value: "job_description" },
        ],
        placeholder: "全部作用域",
        selectedFormat: (count: number) => `已选 ${count} 个作用域`,
        selectedPreviewLimit: 2,
        type: "multi-select" as const,
      },
      {
        emptyMessage: "没有匹配的岗位",
        key: "jobDescriptionId" as const,
        options: jobDescriptions.map((jd) => ({ label: jd.name, value: jd.id })),
        placeholder: "全部岗位",
        searchPlaceholder: "搜索岗位…",
        selectedFormat: (count: number) => `已选 ${count} 个岗位`,
        type: "multi-select" as const,
      },
    ],
    [jobDescriptions],
  );

  function handleAiGenerated({
    jobDescriptionId,
    questions,
  }: {
    jobDescriptionId: string;
    questions: CandidateFormTemplateInput["questions"];
  }) {
    setCreateDraft({
      description: "",
      jobDescriptionIds: [jobDescriptionId],
      questions,
      scope: "job_description",
      title: "",
    });
    setCreateDraftSessionId((id) => id + 1);
    crud.setEditingRecord(null);
    crud.setFormDialogOpen(true);
  }

  let editorDialogKey = "create-empty";
  if (createDraft) {
    editorDialogKey = `create-draft-${createDraftSessionId}`;
  } else if (crud.editingRecord) {
    editorDialogKey = `edit-${crud.editingRecord.id}`;
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          description="准备候选人面试前需要补充的信息，按岗位复用，提交后的内容会随面试记录留档。"
          title="面试表单"
        />

        <DataGrid<CandidateFormTemplateListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardListIcon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有面试表单</EmptyTitle>
                <EmptyDescription>
                  创建后，符合作用域的面试开始前，候选人会先被要求填写表单。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => setAiCreateOpen(true)} type="button">
                  <SparklesIcon className="size-4" />
                  AI 创建面试表单
                </Button>
                <Button
                  onClick={() => {
                    setCreateDraft(null);
                    crud.openCreate();
                  }}
                >
                  <PlusIcon className="size-4" />
                  新建面试表单
                </Button>
              </EmptyContent>
            </Empty>
          }
          filters={filtersConfig}
          filtersExtra={
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline">
                  {archivedFilterLabel}
                  <ChevronDownIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup
                  onValueChange={(v) => grid.setFilter("archivedFilter", v)}
                  value={archivedFilter}
                >
                  <DropdownMenuRadioItem value="active">未归档</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="archived">已归档</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="all">全部</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          }
          getRowId={(r) => r.id}
          toolbarRight={
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2 sm:flex-none">
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => setAiCreateOpen(true)}
                type="button"
              >
                <SparklesIcon className="size-4" />
                AI 创建面试表单
              </Button>
              <Button
                className="flex-1 sm:flex-none"
                onClick={() => {
                  setCreateDraft(null);
                  crud.openCreate();
                }}
              >
                <PlusIcon className="size-4" />
                新建面试表单
              </Button>
            </div>
          }
        />
      </div>

      <FormTemplateAiCreateDialog
        jobDescriptions={jobDescriptions}
        onGenerated={handleAiGenerated}
        onOpenChange={setAiCreateOpen}
        open={aiCreateOpen}
      />

      <CandidateFormTemplateEditorDialog
        initialDraft={createDraft}
        jobDescriptions={jobDescriptions}
        key={editorDialogKey}
        onOpenChange={onEditorOpenChange}
        onSaved={() => {
          grid.invalidate();
          void queryClient.invalidateQueries({ queryKey: ["candidate-form-templates"] });
        }}
        open={crud.formDialogOpen}
        record={crud.editingRecord}
      />

      <CandidateFormTemplateSubmissionsDrawer
        onOpenChange={(value) => !value && setSubmissionsRecord(null)}
        open={submissionsRecord !== null}
        template={submissionsRecord}
      />

      <EntityDeleteDialog
        description={(record) =>
          `即将归档：${record.title}。归档后候选人侧不再看到该表单，但已收到的填写记录保留；之后可在「显示已归档」开关下取消归档。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={crud.deleteRecord}
        title="确认归档这个面试表单？"
      />
    </>
  );
}

interface CandidateFormFilters extends Record<string, string> {
  archivedFilter: string;
  jobDescriptionId: string;
  scope: string;
}

type SearchParamsPrimitive = boolean | number | string;
type SearchParamsRecord = Record<
  string,
  SearchParamsPrimitive | SearchParamsPrimitive[] | undefined
>;

function coerceSearchParams(search: Record<string, unknown>): SearchParamsRecord {
  const out: SearchParamsRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter(
        (item): item is boolean | number | string =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean",
      );
    }
  }
  return out;
}

function parseCandidateFormQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<CandidateFormFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "title", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { archivedFilter: "active", jobDescriptionId: "", scope: "" },
  });
}

function StudioFormsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/forms",
  }) as unknown as StudioFormsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <CandidateFormTemplateManagementPage jobDescriptions={state.jobDescriptions} />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/forms")({
  component: StudioFormsRoute,
  head: () => ({
    meta: [{ title: "面试表单" }],
  }),
  loader: async (loaderContext) => {
    const { location, params } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
      params: { slug: string };
    };
    const query = parseCandidateFormQuery(location.search);
    const state = (await loadStudioFormsState({
      data: { query, slug: params.slug },
    })) as StudioFormsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/forms`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  shouldReload: false,
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
