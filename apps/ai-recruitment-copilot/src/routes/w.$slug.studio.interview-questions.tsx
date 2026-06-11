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
import { loadStudioInterviewQuestionsState } from "@/lib/start/studio/interview-questions.functions";
import type { StudioInterviewQuestionsState } from "@/lib/start/studio/interview-questions.functions";
import { PageHeader } from "@/components/studio/page-header";
import { EntityDeleteDialog } from "@/components/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/studio/use-entity-crud";
import type {
  InterviewQuestionTemplateListRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@arc/db-schema/interview-question-templates";
import type { PaginatedInterviewQuestionTemplateResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/queries";
import { ChevronDownIcon, ListChecksIcon, PlusIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
import { InterviewQuestionTemplateEditorDialog } from "@/components/studio/interview-questions/interview-question-template-editor-dialog";

function scopeLabel(scope: InterviewQuestionTemplateScope) {
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
function InterviewQuestionTemplateManagementPage({
  jobDescriptions,
}: {
  jobDescriptions: JobDescriptionListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

  const fetchTemplates = useCallback(
    async (params: {
      search: string;
      page: number;
      pageSize: number;
      filters: { scope: string; jobDescriptionId: string; archivedFilter: string };
      sortBy: string | undefined;
      sortOrder: "asc" | "desc" | undefined;
    }): Promise<PaginatedInterviewQuestionTemplateResult> => {
      const res = await rpc.api.w[":slug"].studio["interview-questions"].$get({
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
          // archivedFilter 走 DataGrid 的 filter 通道，这样能自动进 queryKey，
          // 变更时触发 react-query 重新拉取（避免出现"换了过滤态但列表不刷新"）。
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
        throw new Error("加载面试题模板列表失败");
      }
      return (await res.json()) as PaginatedInterviewQuestionTemplateResult;
    },
    [slug],
  );

  const loadTemplateDetailById = useCallback(
    async (id: string): Promise<InterviewQuestionTemplateRecord | null> => {
      const response = await rpc.api.w[":slug"].studio["interview-questions"][":id"].$get({
        param: { id, slug },
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as InterviewQuestionTemplateRecord;
    },
    [slug],
  );

  const grid = useDataGridState<
    InterviewQuestionTemplateListRecord,
    { scope: string; jobDescriptionId: string; archivedFilter: string }
  >({
    allowedSortIds: ["createdAt", "title", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { archivedFilter: "active", jobDescriptionId: "", scope: "" },
    queryFn: fetchTemplates,
    queryKeyBase: ["interview-question-templates", slug],
  });
  const archivedFilter = (grid.filters.archivedFilter as "active" | "archived" | "all") || "active";
  const archivedFilterLabel = archivedFilterLabelOf(archivedFilter);

  const routeSearch = useSearch({
    from: "/w/$slug/studio/interview-questions",
  }) as SearchParamsRecord;
  const navigate = useNavigate({ from: "/w/$slug/studio/interview-questions" });
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

  const crud = useEntityCrud<InterviewQuestionTemplateListRecord, InterviewQuestionTemplateRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio["interview-questions"][":id"].$delete({
        param: { id: record.id, slug },
      }),
    invalidate: () => {
      grid.invalidate();
      void queryClient.invalidateQueries({ queryKey: ["interview-question-templates"] });
    },
    loadDetail: (record) => loadTemplateDetailById(record.id),
    messages: {
      // 实际是软删除（归档）：后端 DELETE 现在把 archivedAt 写为当前时间，
      // 把文案与现实对齐避免误导。
      // Backend DELETE is now soft (set archivedAt); reword the toast accordingly.
      deleteSuccess: "模版已归档",
      loadDetailError: "加载模版失败",
    },
  });

  const unarchiveTemplate = useCallback(
    async (record: InterviewQuestionTemplateListRecord) => {
      const res = await rpc.api.w[":slug"].studio["interview-questions"][":id"].unarchive.$post({
        param: { id: record.id, slug },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(body.error ?? "取消归档失败");
        return;
      }
      toast.success("模版已取消归档");
      grid.invalidate();
      void queryClient.invalidateQueries({ queryKey: ["interview-question-templates"] });
    },
    [grid, queryClient, slug],
  );

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
      void setActiveTemplateId(null);
    }
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
        cell: (r) =>
          r.archivedAt ? (
            <Badge variant="outline">已归档</Badge>
          ) : (
            <Badge variant="success">使用中</Badge>
          ),
        key: "archivedAt",
        title: "状态",
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
        cell: (r) => {
          if (r.scope === "global") {
            return "—";
          }
          if (r.jobDescriptions.length === 0) {
            return <Badge variant="outline">岗位已删除</Badge>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {r.jobDescriptions.map((jd) => (
                <Badge key={jd.id} variant="secondary">
                  {jd.name}
                </Badge>
              ))}
            </div>
          );
        },
        key: "jobDescriptions",
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
        placeholder: "搜索模版标题或说明",
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

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          description="沉淀常用必问题，按全局或岗位复用，让每一轮面试都有稳定的问题基线。"
          title="面试题库"
        />

        <DataGrid<InterviewQuestionTemplateListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            <Empty className="border-border">
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
                <Button onClick={crud.openCreate}>
                  <PlusIcon className="size-4" />
                  新建面试题
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
            <Button className="flex-1 sm:flex-none" onClick={crud.openCreate}>
              <PlusIcon className="size-4" />
              新建面试题
            </Button>
          }
        />
      </div>

      <InterviewQuestionTemplateEditorDialog
        jobDescriptions={jobDescriptions}
        onOpenChange={onEditorOpenChange}
        onSaved={() => {
          grid.invalidate();
          void queryClient.invalidateQueries({ queryKey: ["interview-question-templates"] });
        }}
        open={crud.formDialogOpen}
        record={crud.editingRecord}
        slug={slug}
      />

      <EntityDeleteDialog
        description={(record) =>
          `即将归档：${record.title}。归档后不再出现在「选择模板」列表，但已绑定的面试不受影响；之后可在「显示已归档」开关下取消归档。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={crud.deleteRecord}
        title="确认归档这组面试题？"
      />
    </>
  );
}

interface InterviewQuestionFilters extends Record<string, string> {
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

function parseInterviewQuestionQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<InterviewQuestionFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "title", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { archivedFilter: "active", jobDescriptionId: "", scope: "" },
  });
}

function StudioInterviewQuestionsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/interview-questions",
  }) as unknown as StudioInterviewQuestionsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <InterviewQuestionTemplateManagementPage jobDescriptions={state.jobDescriptions} />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/interview-questions")({
  component: StudioInterviewQuestionsRoute,
  head: () => ({
    meta: [{ title: "面试题" }],
  }),
  loader: async (loaderContext) => {
    const { location, params } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
      params: { slug: string };
    };
    const query = parseInterviewQuestionQuery(location.search);
    const state = (await loadStudioInterviewQuestionsState({
      data: { query, slug: params.slug },
    })) as StudioInterviewQuestionsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(
          `/w/${params.slug}/studio/interview-questions`,
        )}`,
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
