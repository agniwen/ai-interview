import { IconFileText, IconPlus } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { ClientOnly, useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import { PageHeader } from "@/components/features/studio/page-header";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import type {
  JobDescriptionListRecord,
  JobDescriptionMetrics,
  JobDescriptionRecord,
} from "@arc/shared/job-descriptions";
import type { PaginatedJobDescriptionResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { JobDescriptionCharts } from "@/components/features/studio/job-descriptions/job-description-charts";
import { ScopedResumesModal } from "@/components/features/studio/scoped-resumes-modal";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { createJobDescriptionReferralLink, rpcFetch } from "@/lib/client/api";
import { runAsyncAction } from "@/lib/client/async-control";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { JobDescriptionFormDialog } from "@/components/features/studio/job-descriptions/job-description-form-dialog";
import { JobDescriptionTalentRecommendationsDialog } from "@/components/features/studio/job-descriptions/job-description-talent-recommendations-dialog";
import { copyTextToClipboard } from "@/lib/client/clipboard";
import { useHasPermission } from "@/hooks/use-has-permission";
import { toast } from "sonner";

export function JobDescriptionManagementPage({
  departments,
  interviewers,
  metrics,
}: {
  departments: DepartmentRecord[];
  interviewers: InterviewerListRecord[];
  metrics: JobDescriptionMetrics;
}) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  // 当前点开"简历关联"的那条 JD；null 表示弹窗关闭。
  // The JD whose associated resumes are being inspected; null = closed.
  const [resumesScope, setResumesScope] = useState<{ id: string; name: string } | null>(null);
  const [recommendationScope, setRecommendationScope] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [copyingReferralIds, setCopyingReferralIds] = useState<Set<string>>(() => new Set());
  const canCreateJobDescription = useHasPermission("jd", "create");
  const canUpdateJobDescription = useHasPermission("jd", "update");
  const canDeleteJobDescription = useHasPermission("jd", "delete");
  const canReadResumeLibrary = useHasPermission("resumeLibrary", "read");

  const fetchJobDescriptions = useCallback(
    (params: {
      search: string;
      page: number;
      pageSize: number;
      filters: { departmentId: string; interviewerId: string };
      sortBy: string | undefined;
      sortOrder: "asc" | "desc" | undefined;
    }): Promise<PaginatedJobDescriptionResult> =>
      rpcFetch<PaginatedJobDescriptionResult>(
        rpc.api.w[":slug"].studio["job-descriptions"].$get({
          param: { slug },
          query: {
            page: String(params.page),
            pageSize: String(params.pageSize),
            ...(params.search ? { search: params.search } : {}),
            // 多选过滤：CSV 形式，例如 "a,b,c"。空串表示不筛选。
            // / Multi-select filters serialize to CSV; empty string means "no filter".
            ...(params.filters.departmentId ? { departmentId: params.filters.departmentId } : {}),
            ...(params.filters.interviewerId
              ? { interviewerId: params.filters.interviewerId }
              : {}),
            sortBy: params.sortBy ?? "createdAt",
            sortOrder: params.sortOrder ?? "desc",
          },
        }),
        "加载在招岗位列表失败",
      ),
    [slug],
  );

  const loadJobDescriptionDetail = useCallback(
    async (record: JobDescriptionListRecord): Promise<JobDescriptionRecord | null> => {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"][":id"].$get({
        param: { id: record.id, slug },
      });
      if (!response.ok) {
        return null;
      }
      return (await response.json()) as JobDescriptionRecord;
    },
    [slug],
  );

  const grid = useDataGridState<
    JobDescriptionListRecord,
    { departmentId: string; interviewerId: string }
  >({
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { departmentId: "", interviewerId: "" },
    queryFn: fetchJobDescriptions,
    queryKeyBase: ["job-descriptions", slug],
  });

  const missingRefs = departments.length === 0 || interviewers.length === 0;

  function invalidateJobDescriptionData() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
    void queryClient.invalidateQueries({ queryKey: ["interviewers"] });
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
    void router.invalidate();
  }

  const crud = useEntityCrud<JobDescriptionListRecord, JobDescriptionRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio["job-descriptions"][":id"].$delete({
        param: { id: record.id, slug },
      }),
    invalidate: invalidateJobDescriptionData,
    loadDetail: loadJobDescriptionDetail,
    messages: {
      deleteSuccess: "在招岗位已删除",
      loadDetailError: "加载在招岗位失败",
    },
  });

  function handleJobDescriptionSaved(savedRecord: JobDescriptionRecord) {
    if (!crud.editingRecord || crud.editingRecord.id === savedRecord.id) {
      crud.setEditingRecord(savedRecord);
    }
    invalidateJobDescriptionData();
  }

  // 深链：其他页面（如简历详情的「关联岗位」）通过 ?jobDescriptionId=<id> 直接打开该岗位详情。
  const deepLinkSearch = useSearch({ from: "/w/$slug/studio/job-descriptions" });
  const navigate = useNavigate({ from: "/w/$slug/studio/job-descriptions" });
  const openedDeepLinkRef = useRef<string | null>(null);
  useEffect(() => {
    const targetId = deepLinkSearch.jobDescriptionId;
    if (typeof targetId !== "string" || targetId.length === 0) {
      // 参数已清空：重置去重标记，允许之后再次深链到同一个岗位。
      openedDeepLinkRef.current = null;
      return;
    }
    if (openedDeepLinkRef.current === targetId) {
      return;
    }
    openedDeepLinkRef.current = targetId;
    void crud.openEdit({ id: targetId } as JobDescriptionListRecord);
    // 打开后清掉 URL 参数，避免刷新/返回时重复弹窗。
    void navigate({
      replace: true,
      search: (prev) => ({ ...prev, jobDescriptionId: undefined }),
    });
  }, [deepLinkSearch.jobDescriptionId, crud, navigate]);

  function onFormOpenChange(next: boolean) {
    crud.onFormOpenChange(next);
  }

  async function copyReferralLink(record: JobDescriptionListRecord) {
    setCopyingReferralIds((current) => new Set(current).add(record.id));
    await runAsyncAction({
      cleanup: () =>
        setCopyingReferralIds((current) => {
          const next = new Set(current);
          next.delete(record.id);
          return next;
        }),
      onError: (error) => toast.error(error instanceof Error ? error.message : "创建内推链接失败"),
      operation: async () => {
        const result = await createJobDescriptionReferralLink(slug, record.id);
        const copyResult = await copyTextToClipboard(result.url);
        if (copyResult === "failed") {
          toast.error("复制失败，请手动复制链接");
          return;
        }
        toast.success(copyResult === "manual" ? "请在弹窗中手动复制内推链接" : "内推链接已复制");
      },
    });
  }

  const editorDialogKey = crud.editingRecord ? `edit-${crud.editingRecord.id}` : "create";
  const canOpenEditorDialog = crud.editingRecord
    ? canUpdateJobDescription
    : canCreateJobDescription;

  const columns = useMemo(
    () => [
      textColumn<JobDescriptionListRecord>({
        key: "name",
        primary: true,
        title: "岗位名称",
        truncate: "max-w-[14rem]",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (record) => {
          if (record.evaluationMode === "legacy") {
            return <Badge variant="outline">旧版岗位</Badge>;
          }
          return record.lifecycleStatus === "draft" ? (
            <Badge variant="secondary">草稿</Badge>
          ) : (
            <Badge>已发布</Badge>
          );
        },
        key: "lifecycleStatus",
        title: "状态",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) =>
          r.code ? (
            <span className="font-mono text-xs">{r.code}</span>
          ) : (
            <span className="text-muted-foreground text-sm">未生成</span>
          ),
        key: "code",
        title: "编码",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => r.departmentName ?? <Badge variant="outline">未知</Badge>,
        key: "departmentName",
        title: "部门",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => {
          if (r.interviewers.length === 0) {
            return <Badge variant="outline">未配置</Badge>;
          }
          return (
            <div className="flex flex-wrap gap-1">
              {r.interviewers.slice(0, 3).map((item) => (
                <Badge key={item.id} variant="secondary">
                  {item.name}
                </Badge>
              ))}
              {r.interviewers.length > 3 ? (
                <Badge variant="outline">+{r.interviewers.length - 3}</Badge>
              ) : null}
            </div>
          );
        },
        key: "interviewers",
        title: "面试官",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => {
          if (r.resumeCount === 0) {
            return <span className="text-muted-foreground text-sm">关联了 0 个简历</span>;
          }
          if (!canReadResumeLibrary) {
            return (
              <span className="text-muted-foreground text-sm">关联了 {r.resumeCount} 个简历</span>
            );
          }
          return (
            <Button
              className="h-auto p-0 font-medium text-primary"
              onClick={() => setResumesScope({ id: r.id, name: r.name })}
              type="button"
              variant="link"
            >
              关联了 {r.resumeCount} 个简历
            </Button>
          );
        },
        key: "resumeCount",
        title: "简历关联",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => (
          <span className="block max-w-sm truncate text-muted-foreground text-sm">
            {(r.evaluationMode === "structured" ? r.prompt : r.description || r.prompt) || "—"}
          </span>
        ),
        key: "description",
        title: "岗位 JD",
      }),
      dateColumn<JobDescriptionListRecord>({
        key: "createdAt",
        title: "创建时间",
      }),
      actionsColumn<JobDescriptionListRecord>({
        inline: [
          {
            label: "推荐",
            onClick: (r) => {
              setRecommendationScope({ id: r.id, name: r.name });
            },
            show: () => canReadResumeLibrary,
          },
          {
            disabled: (r) => copyingReferralIds.has(r.id),
            disabledReason: () => "正在创建内推链接",
            label: "复制内推链接",
            onClick: copyReferralLink,
          },
          {
            label: "编辑",
            onClick: (r) => {
              void crud.openEdit(r);
            },
            show: () => canUpdateJobDescription,
          },
        ],
        menu: [
          {
            label: "删除",
            onClick: (r) => crud.setDeleteRecord(r),
            show: () => canDeleteJobDescription,
            variant: "destructive",
          },
        ],
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [canDeleteJobDescription, canReadResumeLibrary, canUpdateJobDescription, copyingReferralIds],
  );

  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索在招岗位名称或描述",
        type: "search" as const,
      },
      {
        emptyMessage: "没有匹配的部门",
        key: "departmentId" as const,
        options: departments.map((d) => ({ label: d.name, value: d.id })),
        placeholder: "全部部门",
        searchPlaceholder: "搜索部门…",
        selectedFormat: (count: number) => `已选 ${count} 个部门`,
        type: "multi-select" as const,
      },
      {
        emptyMessage: "没有匹配的面试官",
        key: "interviewerId" as const,
        options: interviewers.map((i) => ({
          description: i.departmentName ?? "未知部门",
          label: i.name,
          value: i.id,
        })),
        placeholder: "全部面试官",
        searchPlaceholder: "搜索面试官…",
        selectedFormat: (count: number) => `已选 ${count} 位面试官`,
        type: "multi-select" as const,
      },
    ],
    [departments, interviewers],
  );

  return (
    <>
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader
          description="维护在招岗位、JD 和要求；候选人、面试官和面试都会挂到对应岗位上。"
          title="岗位设置"
        />

        <ClientOnly fallback={<Skeleton className="h-80 w-full" />}>
          <JobDescriptionCharts metrics={metrics} />
        </ClientOnly>

        <DataGrid<JobDescriptionListRecord>
          {...grid.bind}
          columnPinning={{ right: ["actions"] }}
          columns={columns}
          empty={
            missingRefs ? (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconFileText className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>请先创建部门和面试官</EmptyTitle>
                  <EmptyDescription>
                    在招岗位需要同时指定部门和面试官，先去对应页面完成配置。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconFileText className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>还没有在招岗位</EmptyTitle>
                  <EmptyDescription>
                    创建在招岗位之后即可在面试记录中引用，并带上面试官 prompt 与音色。
                  </EmptyDescription>
                </EmptyHeader>
                {canCreateJobDescription ? (
                  <EmptyContent className="flex items-center justify-center">
                    <Button disabled={missingRefs} onClick={() => crud.openCreate()}>
                      <IconPlus className="size-4" />
                      新建在招岗位
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            )
          }
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            canCreateJobDescription ? (
              <Button
                className="flex-1 sm:flex-none"
                disabled={missingRefs}
                onClick={() => crud.openCreate()}
              >
                <IconPlus className="size-4" />
                新建在招岗位
              </Button>
            ) : null
          }
        />
      </div>

      {canOpenEditorDialog ? (
        <JobDescriptionFormDialog
          departments={departments}
          interviewers={interviewers}
          key={editorDialogKey}
          onOpenChange={onFormOpenChange}
          onSaved={handleJobDescriptionSaved}
          open={crud.formDialogOpen}
          record={crud.editingRecord}
        />
      ) : null}

      <EntityDeleteDialog
        confirmDisabled={(record) => record.resumeCount > 0}
        description={(record) => {
          if (record.resumeCount > 0) {
            return `当前有 ${record.resumeCount} 条简历关联到岗位「${record.name}」，无法删除；请先到招聘台取消关联或删除这些候选人。`;
          }
          return `即将删除岗位：${record.name}，引用该岗位的面试记录的关联岗位字段会被清空。`;
        }}
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteJobDescription ? crud.deleteRecord : null}
        title="确认删除这个在招岗位？"
      />

      <ScopedResumesModal
        jobDescription={resumesScope}
        onOpenChange={(next) => {
          if (!next) {
            setResumesScope(null);
          }
        }}
        open={canReadResumeLibrary && resumesScope !== null}
      />

      <JobDescriptionTalentRecommendationsDialog
        jobDescription={recommendationScope}
        onOpenChange={(next) => {
          if (!next) {
            setRecommendationScope(null);
          }
        }}
        open={canReadResumeLibrary && recommendationScope !== null}
      />
    </>
  );
}
