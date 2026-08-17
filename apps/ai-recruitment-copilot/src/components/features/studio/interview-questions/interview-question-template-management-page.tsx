import { IconChevronDown, IconListCheck, IconPlus, IconSparkles } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { PageHeader } from "@/components/features/studio/page-header";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import type {
  InterviewQuestionTemplateInput,
  InterviewQuestionTemplateListRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@arc/db-schema/interview-question-templates";
import type { PaginatedInterviewQuestionTemplateResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interview-questions/dao/queries";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import { rpcFetch } from "@/lib/client/api";
import { coerceSearchParams, firstSearchValue } from "@/lib/client/data-grid-search";
import type { SearchParamsRecord } from "@/lib/client/data-grid-search";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { InterviewQuestionTemplateEditorDialog } from "@/components/features/studio/interview-questions/interview-question-template-editor-dialog";
import { InterviewQuestionTemplateAiCreateDialog } from "@/components/features/studio/interview-questions/interview-question-template-ai-create-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";

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

const archivedFilterSchema = z.enum(["active", "archived", "all"]);

interface TemplateListQuery {
  archived?: string;
  jobDescriptionId?: string;
  page: string;
  pageSize: string;
  scope?: string;
  search?: string;
  sortBy: string;
  sortOrder: "asc" | "desc";
}

// oxlint-disable-next-line complexity -- Page hosts list, filter, pagination, and dialog state together.
export function InterviewQuestionTemplateManagementPage({
  jobDescriptions,
}: {
  jobDescriptions: JobDescriptionListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const canCreateQuestionTemplate = useHasPermission("questionTemplate", "create");
  const canUpdateQuestionTemplate = useHasPermission("questionTemplate", "update");
  const canDeleteQuestionTemplate = useHasPermission("questionTemplate", "delete");

  const fetchTemplates = useCallback(
    (params: {
      search: string;
      page: number;
      pageSize: number;
      filters: { scope: string; jobDescriptionId: string; archivedFilter: string };
      sortBy: string | undefined;
      sortOrder: "asc" | "desc" | undefined;
    }): Promise<PaginatedInterviewQuestionTemplateResult> => {
      const query: TemplateListQuery = {
        page: String(params.page),
        pageSize: String(params.pageSize),
        sortBy: params.sortBy ?? "createdAt",
        sortOrder: params.sortOrder ?? "desc",
      };
      if (params.search) {
        query.search = params.search;
      }
      if (params.filters.scope) {
        query.scope = params.filters.scope;
      }
      if (params.filters.jobDescriptionId) {
        query.jobDescriptionId = params.filters.jobDescriptionId;
      }
      if (params.filters.archivedFilter !== "active") {
        query.archived = params.filters.archivedFilter;
      }
      return rpcFetch<PaginatedInterviewQuestionTemplateResult>(
        rpc.api.w[":slug"].studio["interview-questions"].$get({
          param: { slug },
          query,
        }),
        "加载沟通题列表失败",
      );
    },
    [slug],
  );

  const loadTemplateDetailById = useCallback(
    async (id: string): Promise<InterviewQuestionTemplateRecord | null> =>
      await rpcFetch<InterviewQuestionTemplateRecord>(
        rpc.api.w[":slug"].studio["interview-questions"][":id"].$get({
          param: { id, slug },
        }),
        "加载模版失败",
        { allow404: true },
      ),
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
  const parsedArchivedFilter = archivedFilterSchema.safeParse(grid.filters.archivedFilter);
  const archivedFilter = parsedArchivedFilter.success ? parsedArchivedFilter.data : "active";
  const archivedFilterLabel = archivedFilterLabelOf(archivedFilter);

  const routeSearch = coerceSearchParams(
    useSearch({ from: "/w/$slug/studio/interview-questions" }),
  );
  const navigate = useNavigate({ from: "/w/$slug/studio/interview-questions" });
  const activeTemplateId = firstSearchValue(routeSearch.templateId) ?? "";
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
      try {
        await rpcFetch(
          rpc.api.w[":slug"].studio["interview-questions"][":id"].unarchive.$post({
            param: { id: record.id, slug },
          }),
          "取消归档失败",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "取消归档失败");
        return;
      }
      toast.success("模版已取消归档");
      grid.invalidate();
      void queryClient.invalidateQueries({ queryKey: ["interview-question-templates"] });
    },
    [grid, queryClient, slug],
  );

  const [refreshRecord, setRefreshRecord] = useState<InterviewQuestionTemplateListRecord | null>(
    null,
  );
  // Keep the target while the confirm dialog closes (onOpenChange clears state).
  const pendingRefreshRecordRef = useRef<InterviewQuestionTemplateListRecord | null>(null);

  const openRefreshConfirm = useCallback((record: InterviewQuestionTemplateListRecord) => {
    pendingRefreshRecordRef.current = record;
    setRefreshRecord(record);
  }, []);

  const handleRefreshEligibleCandidates = useCallback(async () => {
    const record = pendingRefreshRecordRef.current ?? refreshRecord;
    pendingRefreshRecordRef.current = null;
    setRefreshRecord(null);
    if (!record) {
      return;
    }
    const toastId = toast.loading("正在刷新未面试候选人沟通题…");
    try {
      const body = await rpcFetch<{ refreshedCount: number; scannedCount: number }>(
        rpc.api.w[":slug"].studio["interview-questions"][":id"][
          "refresh-eligible-candidates"
        ].$post({ param: { id: record.id, slug } }),
        "刷新失败",
      );
      const refreshedCount = body.refreshedCount ?? 0;
      const scannedCount = body.scannedCount ?? 0;
      toast.success(
        refreshedCount === 0
          ? `扫描 ${scannedCount} 人，没有需要更新的未面试候选人`
          : `已刷新 ${refreshedCount} 位未面试候选人（扫描 ${scannedCount} 人）`,
        { id: toastId },
      );
    } catch {
      toast.error("刷新失败", { id: toastId });
    }
  }, [refreshRecord, slug]);

  const [createDraft, setCreateDraft] = useState<InterviewQuestionTemplateInput | null>(null);
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
    if (!canUpdateQuestionTemplate) {
      void setActiveTemplateId(null);
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
    canUpdateQuestionTemplate,
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

  function handleAiGenerated({
    jobDescriptionId,
    questions,
  }: {
    jobDescriptionId: string;
    questions: InterviewQuestionTemplateInput["questions"];
  }) {
    if (!canCreateQuestionTemplate) {
      return;
    }
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
            show: () => canUpdateQuestionTemplate,
          },
        ],
        // 行的归档态决定显示「归档」还是「取消归档」；show 回调按状态二选一。
        // The row's archived state picks one of the two: archive vs unarchive.
        menu: [
          {
            label: "刷新未面试候选人沟通题",
            onClick: (r) => openRefreshConfirm(r),
            show: (r) => canUpdateQuestionTemplate && !r.archivedAt,
          },
          {
            label: "归档",
            onClick: (r) => crud.setDeleteRecord(r),
            show: (r) => canDeleteQuestionTemplate && !r.archivedAt,
            variant: "destructive",
          },
          {
            label: "取消归档",
            onClick: unarchiveTemplate,
            show: (r) => canUpdateQuestionTemplate && Boolean(r.archivedAt),
          },
        ],
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [canDeleteQuestionTemplate, canUpdateQuestionTemplate, openRefreshConfirm],
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
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader
          description="AI 面试时按顺序追问的题目，可全局或按岗位复用；发起后会冻结，改模板不影响已开始的场次。"
          title="沟通题"
        />

        <DataGrid<InterviewQuestionTemplateListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconListCheck className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有沟通题</EmptyTitle>
                <EmptyDescription>
                  创建后，符合作用域的面试在创建时会自动绑定到最新版本的题目快照。
                </EmptyDescription>
              </EmptyHeader>
              {canCreateQuestionTemplate ? (
                <EmptyContent className="flex items-center justify-center">
                  <ButtonGroup>
                    <Button
                      onClick={() => {
                        setCreateDraft(null);
                        crud.openCreate();
                      }}
                    >
                      <IconPlus className="size-4" />
                      新建沟通题
                    </Button>
                    <Button
                      aria-label="AI 创建沟通题"
                      onClick={() => setAiCreateOpen(true)}
                      size="icon"
                      title="AI 创建沟通题"
                      type="button"
                    >
                      <IconSparkles className="size-4" />
                    </Button>
                  </ButtonGroup>
                </EmptyContent>
              ) : null}
            </Empty>
          }
          filters={filtersConfig}
          filtersExtra={
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button type="button" variant="outline">
                    {archivedFilterLabel}
                    <IconChevronDown className="size-4" />
                  </Button>
                }
              />
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
            canCreateQuestionTemplate ? (
              <ButtonGroup className="flex-1 sm:flex-none">
                <Button
                  className="flex-1 sm:flex-none"
                  onClick={() => {
                    setCreateDraft(null);
                    crud.openCreate();
                  }}
                >
                  <IconPlus className="size-4" />
                  新建沟通题
                </Button>
                <Button
                  aria-label="AI 创建沟通题"
                  onClick={() => setAiCreateOpen(true)}
                  size="icon"
                  title="AI 创建沟通题"
                  type="button"
                >
                  <IconSparkles className="size-4" />
                </Button>
              </ButtonGroup>
            ) : null
          }
        />
      </div>

      {canCreateQuestionTemplate ? (
        <InterviewQuestionTemplateAiCreateDialog
          jobDescriptions={jobDescriptions}
          onGenerated={handleAiGenerated}
          onOpenChange={setAiCreateOpen}
          open={aiCreateOpen}
        />
      ) : null}

      {(crud.editingRecord ? canUpdateQuestionTemplate : canCreateQuestionTemplate) ? (
        <InterviewQuestionTemplateEditorDialog
          initialDraft={createDraft}
          jobDescriptions={jobDescriptions}
          key={editorDialogKey}
          onOpenChange={onEditorOpenChange}
          onSaved={() => {
            grid.invalidate();
            void queryClient.invalidateQueries({ queryKey: ["interview-question-templates"] });
          }}
          open={crud.formDialogOpen}
          record={crud.editingRecord}
          slug={slug}
        />
      ) : null}

      <EntityDeleteDialog
        cancelLabel="取消"
        confirmLabel="确认刷新"
        description={(record) =>
          `将把「${record.title}」的最新题目推送到所有适用且尚未开始 AI 面试的候选人。已开始或已完成面试的候选人不会改动。`
        }
        onClose={() => setRefreshRecord(null)}
        onConfirm={handleRefreshEligibleCandidates}
        record={canUpdateQuestionTemplate ? refreshRecord : null}
        title="确认刷新未面试候选人沟通题？"
      />

      <EntityDeleteDialog
        description={(record) =>
          `即将归档：${record.title}。归档后不再出现在「选择模板」列表，但已绑定的面试不受影响；之后可在「显示已归档」开关下取消归档。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteQuestionTemplate ? crud.deleteRecord : null}
        title="确认归档这组沟通题？"
      />
    </>
  );
}
