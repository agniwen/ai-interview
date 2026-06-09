import { HydrationBoundary, dehydrate, useQueryClient } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import {
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
  useRouter,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import {
  buildDataGridQueryKey,
  parseDataGridSearchParams,
} from "@/components/data-grid/query-contract";
import { workspaceDataGridInputSchema } from "@/lib/start/server-fn-validators";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord } from "@arc/shared/interviewers";
import { createQueryClient } from "@arc/shared/query-client";
import { PageHeader } from "@/components/studio/page-header";
import { EntityDeleteDialog } from "@/components/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/studio/use-entity-crud";
import type {
  JobDescriptionListRecord,
  JobDescriptionMetrics,
  JobDescriptionRecord,
} from "@arc/shared/job-descriptions";
import type { PaginatedJobDescriptionResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao";
import { JobDescriptionCharts } from "@/components/studio/job-descriptions/job-description-charts";
import { ScopedResumesModal } from "@/components/studio/scoped-resumes-modal";
import { FileTextIcon, PlusIcon } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
import { rpc } from "@/lib/client/rpc";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { JobDescriptionFormDialog } from "@/components/studio/job-descriptions/job-description-form-dialog";

function JobDescriptionManagementPage({
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

  const fetchJobDescriptions = useCallback(
    async (params: {
      search: string;
      page: number;
      pageSize: number;
      filters: { departmentId: string; interviewerId: string };
      sortBy: string | undefined;
      sortOrder: "asc" | "desc" | undefined;
    }): Promise<PaginatedJobDescriptionResult> => {
      const res = await rpc.api.w[":slug"].studio["job-descriptions"].$get({
        param: { slug },
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          ...(params.search ? { search: params.search } : {}),
          // 多选过滤：CSV 形式，例如 "a,b,c"。空串表示不筛选。
          // / Multi-select filters serialize to CSV; empty string means "no filter".
          ...(params.filters.departmentId ? { departmentId: params.filters.departmentId } : {}),
          ...(params.filters.interviewerId ? { interviewerId: params.filters.interviewerId } : {}),
          sortBy: params.sortBy ?? "createdAt",
          sortOrder: params.sortOrder ?? "desc",
        },
      });
      if (!res.ok) {
        throw new Error("加载在招岗位列表失败");
      }
      return (await res.json()) as PaginatedJobDescriptionResult;
    },
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

  const columns = useMemo(
    () => [
      textColumn<JobDescriptionListRecord>({
        key: "name",
        primary: true,
        title: "岗位名称",
        truncate: "max-w-[14rem]",
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
            {r.description || "—"}
          </span>
        ),
        key: "description",
        title: "描述",
      }),
      dateColumn<JobDescriptionListRecord>({
        key: "createdAt",
        title: "创建时间",
      }),
      actionsColumn<JobDescriptionListRecord>({
        inline: [
          {
            label: "编辑",
            onClick: (r) => {
              void crud.openEdit(r);
            },
          },
        ],
        menu: [
          {
            label: "删除",
            onClick: (r) => crud.setDeleteRecord(r),
            variant: "destructive",
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
      <div className="space-y-6">
        <PageHeader
          description="按岗位组织候选人、面试官和面试数据，让招聘进展和团队分工都落到同一处。"
          title="在招岗位"
        />

        <JobDescriptionCharts metrics={metrics} />

        <DataGrid<JobDescriptionListRecord>
          {...grid.bind}
          columnPinning={{ right: ["actions"] }}
          columns={columns}
          empty={
            missingRefs ? (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <FileTextIcon className="size-5" />
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
                    <FileTextIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>还没有在招岗位</EmptyTitle>
                  <EmptyDescription>
                    创建在招岗位之后即可在面试记录中引用，并带上面试官 prompt 与音色。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={crud.openCreate}>
                    <PlusIcon className="size-4" />
                    新建在招岗位
                  </Button>
                </EmptyContent>
              </Empty>
            )
          }
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            <Button
              className="flex-1 sm:flex-none"
              disabled={missingRefs}
              onClick={crud.openCreate}
            >
              <PlusIcon className="size-4" />
              新建在招岗位
            </Button>
          }
        />
      </div>

      <JobDescriptionFormDialog
        departments={departments}
        interviewers={interviewers}
        onOpenChange={crud.onFormOpenChange}
        onSaved={invalidateJobDescriptionData}
        open={crud.formDialogOpen}
        record={crud.editingRecord}
      />

      <EntityDeleteDialog
        confirmDisabled={(record) => record.resumeCount > 0}
        description={(record) => {
          if (record.resumeCount > 0) {
            return `当前有 ${record.resumeCount} 条简历关联到岗位「${record.name}」，无法删除；请先到简历库取消关联或删除这些候选人。`;
          }
          return `即将删除岗位：${record.name}，引用该岗位的面试记录的关联岗位字段会被清空。`;
        }}
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={crud.deleteRecord}
        title="确认删除这个在招岗位？"
      />

      <ScopedResumesModal
        jobDescription={resumesScope}
        onOpenChange={(next) => {
          if (!next) {
            setResumesScope(null);
          }
        }}
        open={resumesScope !== null}
      />
    </>
  );
}

interface JobDescriptionFilters extends Record<string, string> {
  departmentId: string;
  interviewerId: string;
}

const jobDescriptionFiltersSchema = z.object({
  departmentId: z.string(),
  interviewerId: z.string(),
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;
type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };
type StudioJobDescriptionsState =
  | { status: "unauthenticated" }
  | { status: "not_found" }
  | {
      departments: DepartmentRecord[];
      dehydratedState: JsonValue;
      interviewers: InterviewerListRecord[];
      metrics: JobDescriptionMetrics;
      status: "ready";
    };

function coerceSearchParams(search: Record<string, unknown>): SearchParamsRecord {
  const out: SearchParamsRecord = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter((item): item is string => typeof item === "string");
    }
  }
  return out;
}

function parseJobDescriptionQuery(
  searchParams: SearchParamsRecord,
): DataGridQueryState<JobDescriptionFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { departmentId: "", interviewerId: "" },
  });
}

const loadStudioJobDescriptionsState = createServerFn({ method: "GET" })
  .validator(workspaceDataGridInputSchema(jobDescriptionFiltersSchema))
  .handler(async ({ data }): Promise<StudioJobDescriptionsState> => {
    const { resolveWorkspaceAccessFromRequest } = await import("@/lib/start/auth-session.server");
    const { listAllDepartments } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao");
    const { listAllInterviewers } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao");
    const { listJobDescriptions, loadJobDescriptionMetrics } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao");
    const access = await resolveWorkspaceAccessFromRequest(data.slug);
    if (access.status !== "ready") {
      return access;
    }

    const queryClient = createQueryClient();
    const [departments, interviewers, metrics] = await Promise.all([
      listAllDepartments(access.workspace.id),
      listAllInterviewers(access.workspace.id),
      loadJobDescriptionMetrics(access.workspace.id),
      queryClient.prefetchQuery({
        queryFn: () =>
          listJobDescriptions(
            access.workspace.id,
            {
              departmentId: data.query.filters.departmentId,
              interviewerId: data.query.filters.interviewerId,
              search: data.query.search,
            },
            {
              page: data.query.page,
              pageSize: data.query.pageSize,
              sortBy: data.query.sortBy,
              sortOrder: data.query.sortOrder,
            },
          ),
        queryKey: buildDataGridQueryKey(["job-descriptions", data.slug], data.query),
      }),
    ]);

    return {
      dehydratedState: structuredClone(dehydrate(queryClient)) as unknown as JsonValue,
      departments,
      interviewers,
      metrics,
      status: "ready" as const,
    };
  });

function StudioJobDescriptionsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/job-descriptions",
  }) as unknown as StudioJobDescriptionsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <JobDescriptionManagementPage
        departments={state.departments}
        interviewers={state.interviewers}
        metrics={state.metrics}
      />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/job-descriptions")({
  component: StudioJobDescriptionsRoute,
  head: () => ({
    meta: [{ title: "在招岗位管理" }],
  }),
  loader: async (loaderContext) => {
    const { deps, params } = loaderContext as unknown as {
      deps: { query: DataGridQueryState<JobDescriptionFilters> };
      params: { slug: string };
    };
    const state = (await loadStudioJobDescriptionsState({
      data: { query: deps.query, slug: params.slug },
    })) as StudioJobDescriptionsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(
          `/w/${params.slug}/studio/job-descriptions`,
        )}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  loaderDeps: ({ search }) => ({
    query: parseJobDescriptionQuery(search as SearchParamsRecord),
  }),
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
