import { HydrationBoundary, useQueryClient } from "@tanstack/react-query";
import type { DehydratedState } from "@tanstack/react-query";
import {
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
  useRouter,
} from "@tanstack/react-router";
import type { DataGridQueryState } from "@/components/data-grid/query-contract";
import { parseDataGridSearchParams } from "@/components/data-grid/query-contract";
import { loadStudioDepartmentsState } from "@/lib/start/studio/departments.functions";
import type { StudioDepartmentsState } from "@/lib/start/studio/departments.functions";
import { PageHeader } from "@/components/studio/page-header";
import { EntityDeleteDialog } from "@/components/studio/entity-delete-dialog";
import { ScopedInterviewersModal } from "@/components/studio/scoped-interviewers-modal";
import { ScopedJobDescriptionsModal } from "@/components/studio/scoped-job-descriptions-modal";
import { useEntityCrud } from "@/components/studio/use-entity-crud";
import type { DepartmentListRecord, DepartmentRecord } from "@arc/shared/departments";
import type { PaginatedDepartmentResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao";
import { Building2Icon, PlusIcon } from "lucide-react";
import { useMemo, useState } from "react";
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
import { DepartmentFormDialog } from "@/components/studio/departments/department-form-dialog";

function DepartmentManagementPage() {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();

  const fetchDepartments = useMemo(
    () =>
      async (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: Record<string, never>;
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }): Promise<PaginatedDepartmentResult> => {
        const res = await rpc.api.w[":slug"].studio.departments.$get({
          param: { slug },
          query: {
            page: String(params.page),
            pageSize: String(params.pageSize),
            ...(params.search ? { search: params.search } : {}),
            sortBy: params.sortBy ?? "createdAt",
            sortOrder: params.sortOrder ?? "desc",
          },
        });
        if (!res.ok) {
          throw new Error("加载部门列表失败");
        }
        return (await res.json()) as PaginatedDepartmentResult;
      },
    [slug],
  );

  const grid = useDataGridState<DepartmentListRecord, Record<string, never>>({
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
    queryFn: fetchDepartments,
    queryKeyBase: ["departments", slug],
  });

  // 两类 scope 弹窗的当前目标部门；null 表示弹窗关闭。
  // Track which department each scope modal is opened against; null = closed.
  const [interviewersModalDept, setInterviewersModalDept] = useState<DepartmentListRecord | null>(
    null,
  );
  const [jobDescriptionsModalDept, setJobDescriptionsModalDept] =
    useState<DepartmentListRecord | null>(null);

  function invalidateDepartmentData() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
    void queryClient.invalidateQueries({ queryKey: ["interviewers"] });
    void queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
    void router.invalidate();
  }

  const crud = useEntityCrud<DepartmentListRecord, DepartmentRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio.departments[":id"].$delete({ param: { id: record.id, slug } }),
    detailFromList: (record) => record as unknown as DepartmentRecord,
    invalidate: invalidateDepartmentData,
    messages: {
      deleteSuccess: "部门已删除",
    },
  });

  const columns = useMemo(
    () => [
      textColumn<DepartmentListRecord>({
        key: "name",
        primary: true,
        title: "部门名称",
      }),
      textColumn<DepartmentListRecord>({
        fallback: "—",
        key: "description",
        muted: true,
        title: "描述",
        truncate: true,
      }),
      customColumn<DepartmentListRecord>({
        cell: (r) => {
          // 0 引用时纯文本（跟面试官页风格对齐）；>0 时 link 按钮，点击打开
          // 只读的面试官列表弹窗。
          // Zero → plain text (matches the interviewer page style); positive →
          // link button opening the read-only interviewers modal.
          if (r.interviewerCount === 0) {
            return "0 位面试官";
          }
          return (
            <Button
              className="h-auto p-0 font-medium text-primary"
              onClick={() => setInterviewersModalDept(r)}
              type="button"
              variant="link"
            >
              {r.interviewerCount} 位面试官
            </Button>
          );
        },
        key: "interviewerCount",
        title: "面试官",
      }),
      customColumn<DepartmentListRecord>({
        cell: (r) => {
          // 0 引用时纯文本；>0 时 link 按钮，打开"删除/查看"语义的 JD 弹窗。
          // Zero → plain text; positive → link button opening the JD scope
          // modal which also supports row-level deletes.
          if (r.jobDescriptionCount === 0) {
            return "0 个岗位";
          }
          return (
            <Button
              className="h-auto p-0 font-medium text-primary"
              onClick={() => setJobDescriptionsModalDept(r)}
              type="button"
              variant="link"
            >
              {r.jobDescriptionCount} 个岗位
            </Button>
          );
        },
        key: "jobDescriptionCount",
        title: "在招岗位",
      }),
      dateColumn<DepartmentListRecord>({
        key: "createdAt",
        title: "创建时间",
      }),
      actionsColumn<DepartmentListRecord>({
        inline: [
          {
            label: "编辑",
            onClick: (r) => void crud.openEdit(r),
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- columns 不应每次 crud 引用变化都重建
    [],
  );

  const filtersConfig = useMemo(
    () => [
      {
        key: "search" as const,
        minWidth: "15rem",
        placeholder: "搜索部门名称或描述",
        type: "search" as const,
      },
    ],
    [],
  );

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          description="按业务团队整理岗位和面试官，后续筛选、统计和协作都能对齐到部门。"
          title="部门"
        />

        <DataGrid<DepartmentListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2Icon className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有部门</EmptyTitle>
                <EmptyDescription>
                  创建部门之后可以把面试官和在招岗位组织起来，面试时按部门挑选配置。
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={crud.openCreate}>
                  <PlusIcon className="size-4" />
                  新建部门
                </Button>
              </EmptyContent>
            </Empty>
          }
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            <Button className="flex-1 sm:flex-none" onClick={crud.openCreate}>
              <PlusIcon className="size-4" />
              新建部门
            </Button>
          }
        />
      </div>

      <DepartmentFormDialog
        onOpenChange={crud.onFormOpenChange}
        onSaved={invalidateDepartmentData}
        open={crud.formDialogOpen}
        record={crud.editingRecord}
      />

      <EntityDeleteDialog
        description={(record) =>
          record.interviewerCount > 0 || record.jobDescriptionCount > 0
            ? "该部门下仍有面试官或在招岗位，将无法删除。"
            : `即将删除部门：${record.name}，删除后无法恢复。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={crud.deleteRecord}
        title="确认删除这个部门？"
      />

      <ScopedInterviewersModal
        departmentId={interviewersModalDept?.id ?? null}
        departmentName={interviewersModalDept?.name ?? ""}
        onChange={() => {
          invalidateDepartmentData();
        }}
        onOpenChange={(next) => {
          if (!next) {
            setInterviewersModalDept(null);
          }
        }}
        open={interviewersModalDept !== null}
      />

      <ScopedJobDescriptionsModal
        onChange={() => {
          invalidateDepartmentData();
        }}
        onOpenChange={(next) => {
          if (!next) {
            setJobDescriptionsModalDept(null);
          }
        }}
        open={jobDescriptionsModalDept !== null}
        scope={
          jobDescriptionsModalDept
            ? {
                id: jobDescriptionsModalDept.id,
                name: jobDescriptionsModalDept.name,
                type: "department",
              }
            : null
        }
      />
    </>
  );
}

type EmptyFilters = Record<string, never>;
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

function parseDepartmentQuery(searchParams: SearchParamsRecord): DataGridQueryState<EmptyFilters> {
  return parseDataGridSearchParams(searchParams, {
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
  });
}

function StudioDepartmentsRoute() {
  const state = useLoaderData({
    from: "/w/$slug/studio/departments",
  }) as unknown as StudioDepartmentsState;

  if (state.status !== "ready") {
    return null;
  }

  return (
    <HydrationBoundary state={state.dehydratedState as unknown as DehydratedState}>
      <DepartmentManagementPage />
    </HydrationBoundary>
  );
}

export const Route = createFileRoute("/w/$slug/studio/departments")({
  component: StudioDepartmentsRoute,
  head: () => ({
    meta: [{ title: "部门管理" }],
  }),
  loader: async (loaderContext) => {
    const { location, params } = loaderContext as unknown as {
      location: { search: SearchParamsRecord };
      params: { slug: string };
    };
    const query = parseDepartmentQuery(location.search);
    const state = (await loadStudioDepartmentsState({
      data: { query, slug: params.slug },
    })) as StudioDepartmentsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/departments`)}`,
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
