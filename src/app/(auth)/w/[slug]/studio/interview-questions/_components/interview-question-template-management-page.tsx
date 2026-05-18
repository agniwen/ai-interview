"use client";

import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import { EntityDeleteDialog } from "@/app/(auth)/w/[slug]/studio/_components/entity-delete-dialog";
import { useEntityCrud } from "@/app/(auth)/w/[slug]/studio/_components/use-entity-crud";
import type {
  InterviewQuestionTemplateListRecord,
  InterviewQuestionTemplateRecord,
  InterviewQuestionTemplateScope,
} from "@/lib/shared/interview-question-templates";
import type { JobDescriptionListRecord } from "@/lib/shared/job-descriptions";
import type { PaginatedInterviewQuestionTemplateResult } from "@/server/routes/studio/routes/interview-questions/dao/queries";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ChevronDownIcon,
  ListChecksIcon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import { parseAsString, parseAsStringEnum, useQueryState } from "nuqs";
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
import { InterviewQuestionTemplateEditorDialog } from "./interview-question-template-editor-dialog";

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

// oxlint-disable-next-line complexity -- Page hosts list, filter, pagination, and dialog state together.
export function InterviewQuestionTemplateManagementPage({
  initialData,
  jobDescriptions,
}: {
  initialData: PaginatedInterviewQuestionTemplateResult;
  jobDescriptions: JobDescriptionListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

  // 归档过滤三态，URL 持久化便于刷新 / 分享。
  // Tri-state archived filter, URL-persisted for refresh/share.
  const [archivedFilter, setArchivedFilter] = useQueryState(
    "archived",
    parseAsStringEnum(["active", "archived", "all"])
      .withDefault("active")
      .withOptions({ clearOnDefault: true }),
  );
  const archivedFilterLabel = archivedFilterLabelOf(archivedFilter);

  const fetchTemplates = useCallback(
    async (params: {
      search: string;
      page: number;
      pageSize: number;
      filters: { scope: string; jobDescriptionId: string };
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
          ...(archivedFilter === "active" ? {} : { archived: archivedFilter }),
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      });
      if (!res.ok) {
        throw new Error("加载面试题模板列表失败");
      }
      return (await res.json()) as PaginatedInterviewQuestionTemplateResult;
    },
    [slug, archivedFilter],
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
    { scope: string; jobDescriptionId: string }
  >({
    fetcher: fetchTemplates,
    initialData,
    initialFilters: { jobDescriptionId: "", scope: "" },
    namespace: "interview-question-templates",
  });

  // URL-bound drawer state — not a list filter; kept independent of DataGrid.
  const [activeTemplateId, setActiveTemplateId] = useQueryState(
    "templateId",
    parseAsString.withDefault("").withOptions({ clearOnDefault: true }),
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
            icon: PencilIcon,
            label: "编辑模版",
            onClick: (r) => {
              void crud.openEdit(r);
            },
          },
        ],
        // 行的归档态决定显示「归档」还是「取消归档」；show 回调按状态二选一。
        // The row's archived state picks one of the two: archive vs unarchive.
        menu: [
          {
            icon: ArchiveIcon,
            label: "归档",
            onClick: (r) => crud.setDeleteRecord(r),
            show: (r) => !r.archivedAt,
            variant: "destructive",
          },
          {
            icon: ArchiveRestoreIcon,
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
          description="配置面试官在面试中向候选人必问的题目。可以设为全局或绑定到在招岗位；面试创建时会冻结当前题目快照，之后编辑不影响已开始的面试。"
          title="面试题"
        />

        <DataGrid<InterviewQuestionTemplateListRecord>
          {...grid.bind}
          columns={columns}
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
                <Button onClick={crud.openCreate}>
                  <PlusIcon className="size-4" />
                  新建面试题
                </Button>
              </EmptyContent>
            </Empty>
          }
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            <div className="flex flex-wrap items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" type="button" variant="outline">
                    {archivedFilterLabel}
                    <ChevronDownIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuRadioGroup
                    onValueChange={(v) =>
                      void setArchivedFilter(v as "active" | "archived" | "all")
                    }
                    value={archivedFilter}
                  >
                    <DropdownMenuRadioItem value="active">未归档</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="archived">已归档</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="all">全部</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button className="flex-1 sm:flex-none" onClick={crud.openCreate}>
                <PlusIcon className="size-4" />
                新建面试题
              </Button>
            </div>
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
