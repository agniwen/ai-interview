import { listTextQuery } from "@arc/shared/list-text-filters";
import { IconClipboardList, IconPlus, IconSparkles } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { PageHeader } from "@/components/features/studio/page-header";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import type {
  CandidateFormScope,
  CandidateFormTemplateInput,
  CandidateFormTemplateListRecord,
  CandidateFormTemplateRecord,
} from "@arc/db-schema/candidate-forms";
import type { PaginatedCandidateFormTemplateResult } from "@app/server/server/routes/studio/routes/forms/dao/queries";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
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
import { CandidateFormTemplateEditorDialog } from "@/components/features/studio/forms/form-template-editor-dialog";
import { FormTemplateAiCreateDialog } from "@/components/features/studio/forms/form-template-ai-create-dialog";
import { CandidateFormTemplateSubmissionsDrawer } from "@/components/features/studio/forms/form-template-submissions-drawer";
import { useHasPermission } from "@/hooks/use-has-permission";

function scopeLabel(scope: CandidateFormScope) {
  return scope === "global" ? "全局" : "岗位绑定";
}

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
export function CandidateFormTemplateManagementPage({
  jobDescriptions,
}: {
  jobDescriptions: JobDescriptionListRecord[];
}) {
  "use no memo";

  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const canCreateCandidateForm = useHasPermission("candidateForm", "create");
  const canUpdateCandidateForm = useHasPermission("candidateForm", "update");
  const canDeleteCandidateForm = useHasPermission("candidateForm", "delete");

  const fetchTemplates = useMemo(
    () =>
      (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: { scope: string; jobDescriptionId: string; archivedFilter: string };
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }): Promise<PaginatedCandidateFormTemplateResult> => {
        const query: TemplateListQuery = {
          ...listTextQuery(params),
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
        return rpcFetch(
          rpc.api.w[":slug"].studio.forms.$get({
            param: { slug },
            query,
          }),
          "加载表单题列表失败",
        );
      },
    [slug],
  );

  const loadTemplateDetailById = useCallback(
    async (id: string): Promise<CandidateFormTemplateRecord | null> =>
      await rpcFetch(
        rpc.api.w[":slug"].studio.forms[":id"].$get({ param: { id, slug } }),
        "加载模版失败",
        { allow404: true },
      ),
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

  const routeSearch = coerceSearchParams(useSearch({ from: "/w/$slug/studio/forms" }));
  const navigate = useNavigate({ from: "/w/$slug/studio/forms" });
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
      try {
        await rpcFetch(
          rpc.api.w[":slug"].studio.forms[":id"].unarchive.$post({
            param: { id: record.id, slug },
          }),
          "取消归档失败",
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "取消归档失败");
        return;
      }
      toast.success("表单已取消归档");
      grid.invalidate();
      void queryClient.invalidateQueries({ queryKey: ["candidate-form-templates"] });
    },
    [grid, queryClient, slug],
  );

  const [refreshRecord, setRefreshRecord] = useState<CandidateFormTemplateListRecord | null>(null);
  // Keep the target while the confirm dialog closes (onOpenChange clears state).
  const pendingRefreshRecordRef = useRef<CandidateFormTemplateListRecord | null>(null);

  const openRefreshConfirm = useCallback((record: CandidateFormTemplateListRecord) => {
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
    const toastId = toast.loading("正在刷新未填写候选人表单题…");
    try {
      const body = await rpcFetch(
        rpc.api.w[":slug"].studio.forms[":id"]["refresh-eligible-candidates"].$post({
          param: { id: record.id, slug },
        }),
        "刷新失败",
      );
      const refreshedCount = body.refreshedCount ?? 0;
      const scannedCount = body.scannedCount ?? 0;
      toast.success(
        refreshedCount === 0
          ? `扫描 ${scannedCount} 人，没有需要更新的未填写候选人`
          : `已刷新 ${refreshedCount} 位未填写候选人（扫描 ${scannedCount} 人）`,
        { id: toastId },
      );
    } catch {
      toast.error("刷新失败", { id: toastId });
    }
  }, [refreshRecord, slug]);

  const [submissionsRecord, setSubmissionsRecord] =
    useState<CandidateFormTemplateListRecord | null>(null);
  const [createDraft, setCreateDraft] = useState<CandidateFormTemplateInput | null>(null);
  const [aiCreateOpen, setAiCreateOpen] = useState(false);

  // When the URL carries `?templateId=...` (e.g. clicked from the JD dialog),
  // load the detail and pop the editor open.
  const lastLoadedTemplateRef = useRef<string | null>(null);
  const { setEditingRecord, setFormDialogOpen } = crud;
  useEffect(() => {
    if (!activeTemplateId || lastLoadedTemplateRef.current === activeTemplateId) {
      return;
    }
    if (!canUpdateCandidateForm) {
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
    canUpdateCandidateForm,
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
              className="text-primary-link text-sm underline-offset-4 hover:underline tabular-nums"
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
            show: () => canUpdateCandidateForm,
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
            label: "刷新未填写候选人表单题",
            onClick: (r) => openRefreshConfirm(r),
            show: (r) => canUpdateCandidateForm && !r.archivedAt,
          },
          {
            label: "归档",
            onClick: (r) => crud.setDeleteRecord(r),
            show: (r) => canDeleteCandidateForm && !r.archivedAt,
            variant: "destructive",
          },
          {
            label: "取消归档",
            onClick: unarchiveTemplate,
            show: (r) => canUpdateCandidateForm && Boolean(r.archivedAt),
          },
        ],
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [canDeleteCandidateForm, canUpdateCandidateForm, openRefreshConfirm],
  );

  const filtersConfig = useMemo(
    () => [
      {
        key: "archivedFilter",
        label: "归档状态",
        options: [
          { label: "未归档", value: "active" },
          { label: "已归档", value: "archived" },
        ],
        type: "select" as const,
        unfilteredValue: "all",
      },
      { key: "textFilters" as const, resource: "forms" as const, type: "text-filters" as const },
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
    if (!canCreateCandidateForm) {
      return;
    }
    setCreateDraft({
      description: "",
      jobDescriptionIds: [jobDescriptionId],
      questions,
      scope: "job_description",
      title: "",
    });
    crud.setEditingRecord(null);
    crud.setFormDialogOpen(true);
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader description="可按岗位复用；提交后随面试留档。" title="表单题" />

        <DataGrid<CandidateFormTemplateListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconClipboardList className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有表单题</EmptyTitle>
                <EmptyDescription>
                  创建后，符合作用域的面试开始前，候选人会先被要求填写表单。
                </EmptyDescription>
              </EmptyHeader>
              {canCreateCandidateForm ? (
                <EmptyContent className="flex items-center justify-center">
                  <ButtonGroup>
                    <Button
                      onClick={() => {
                        setCreateDraft(null);
                        crud.openCreate();
                      }}
                    >
                      <IconPlus className="size-4" />
                      创建表单题
                    </Button>
                    <Button
                      aria-label="AI 创建表单题"
                      onClick={() => setAiCreateOpen(true)}
                      size="icon"
                      title="AI 创建表单题"
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
          getRowId={(r) => r.id}
          toolbarRight={
            canCreateCandidateForm ? (
              <ButtonGroup className="flex-1 sm:flex-none">
                <Button
                  className="flex-1 sm:flex-none"
                  onClick={() => {
                    setCreateDraft(null);
                    crud.openCreate();
                  }}
                >
                  <IconPlus className="size-4" />
                  创建表单题
                </Button>
                <Button
                  aria-label="AI 创建表单题"
                  onClick={() => setAiCreateOpen(true)}
                  size="icon"
                  title="AI 创建表单题"
                  type="button"
                >
                  <IconSparkles className="size-4" />
                </Button>
              </ButtonGroup>
            ) : null
          }
        />
      </div>

      {canCreateCandidateForm ? (
        <FormTemplateAiCreateDialog
          jobDescriptions={jobDescriptions}
          onGenerated={handleAiGenerated}
          onOpenChange={setAiCreateOpen}
          open={aiCreateOpen}
        />
      ) : null}

      {(crud.editingRecord ? canUpdateCandidateForm : canCreateCandidateForm) ? (
        <CandidateFormTemplateEditorDialog
          initialDraft={createDraft}
          jobDescriptions={jobDescriptions}
          onOpenChange={onEditorOpenChange}
          onSaved={() => {
            grid.invalidate();
            void queryClient.invalidateQueries({ queryKey: ["candidate-form-templates"] });
          }}
          open={crud.formDialogOpen}
          record={crud.editingRecord}
        />
      ) : null}

      <CandidateFormTemplateSubmissionsDrawer
        onOpenChange={(value) => !value && setSubmissionsRecord(null)}
        open={submissionsRecord !== null}
        template={submissionsRecord}
      />

      <EntityDeleteDialog
        cancelLabel="取消"
        confirmLabel="确认刷新"
        description={(record) =>
          `将把「${record.title}」的最新表单推送到所有适用、尚未填写且未开始 AI 面试的候选人。已填写或已开始面试的候选人不会改动。`
        }
        onClose={() => setRefreshRecord(null)}
        onConfirm={handleRefreshEligibleCandidates}
        record={canUpdateCandidateForm ? refreshRecord : null}
        title="确认刷新未填写候选人表单题？"
      />

      <EntityDeleteDialog
        description={(record) =>
          `即将归档：${record.title}。归档后候选人侧不再看到该表单，但已收到的填写记录保留；之后可在「显示已归档」开关下取消归档。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteCandidateForm ? crud.deleteRecord : null}
        title="确认归档这个表单题？"
      />
    </>
  );
}
