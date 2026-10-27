import { listTextQuery } from "@app/shared/list-text-filters";
import { IconPlus, IconUserCircle } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { DepartmentRecord } from "@app/shared/departments";
import { PageHeader } from "@/components/features/studio/page-header";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import type { InterviewerListRecord, InterviewerRecord } from "@app/shared/interviewers";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { DataCardList, useDataGridState } from "@/components/features/data-grid";
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
import { jobDescriptionKeys } from "@/lib/client/api/query-keys";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { ScopedJobDescriptionsModal } from "@/components/features/studio/scoped-job-descriptions-modal";
import {
  InterviewerAgentCard,
  InterviewerAgentCardSkeleton,
} from "@/components/features/studio/interviewers/interviewer-agent-card";
import { InterviewerFormDialog } from "@/components/features/studio/interviewers/interviewer-form-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";

// 与服务端列表接口的 pageSize 上限一致。Matches the server list endpoint max page size.
const INTERVIEWER_AGENT_FETCH_PAGE_SIZE = 100;

type InterviewerAgentFilters = Record<"departmentId" | "jobDescriptionId", string>;

export function InterviewerManagementPage({ departments }: { departments: DepartmentRecord[] }) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canCreateInterviewer = useHasPermission("interviewer", "create");
  const canUpdateInterviewer = useHasPermission("interviewer", "update");
  const canDeleteInterviewer = useHasPermission("interviewer", "delete");
  const canReadJobDescriptions = useHasPermission("jd", "read");

  // 页面不分页：按接口单页上限逐页取回全部面试官 Agent，避免超过上限时静默截断。
  // The page is unpaginated: walk every server page at the max size so nothing is silently cut off.
  const fetchInterviewers = useMemo(
    () =>
      async (params: {
        search: string;
        filters: InterviewerAgentFilters;
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }) => {
        const fetchPage = (page: number) =>
          rpcFetch(
            rpc.api.w[":slug"].studio.interviewers.$get({
              param: { slug },
              query: {
                departmentId: params.filters.departmentId || undefined,
                jobDescriptionId: params.filters.jobDescriptionId || undefined,
                page: String(page),
                pageSize: String(INTERVIEWER_AGENT_FETCH_PAGE_SIZE),
                search: params.search || undefined,
                ...listTextQuery(params),
                sortBy: params.sortBy ?? "createdAt",
                sortOrder: params.sortOrder ?? "desc",
              },
            }),
            "加载面试官 Agent 列表失败",
          );
        const first = await fetchPage(1);
        const rest = await Promise.all(
          Array.from({ length: first.totalPages - 1 }, (_, index) => fetchPage(index + 2)),
        );
        const records = [first, ...rest].flatMap((result) => result.records);
        return { records, total: first.total, totalPages: 1 };
      },
    [slug],
  );

  function loadInterviewerDetail(record: InterviewerListRecord): Promise<InterviewerRecord | null> {
    return rpcFetch(
      rpc.api.w[":slug"].studio.interviewers[":id"].$get({
        param: { id: record.id, slug },
      }),
      "加载面试官 Agent 详情失败",
      { allow404: true },
    );
  }

  // 岗位筛选选项需要岗位读取权限；没有权限时不展示该筛选。
  // JD filter options require JD read access; the filter is hidden without it.
  const { data: jobDescriptions = [], isFetching: jobDescriptionsLoading } = useQuery({
    enabled: canReadJobDescriptions,
    queryFn: async () => {
      const payload = await rpcFetch(
        rpc.api.w[":slug"].studio["job-descriptions"].all.$get({ param: { slug } }),
        "加载岗位列表失败",
      );
      return payload.records;
    },
    queryKey: jobDescriptionKeys.managed(slug),
    staleTime: 60_000,
  });

  const grid = useDataGridState<InterviewerListRecord, InterviewerAgentFilters>({
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: { departmentId: "", jobDescriptionId: "" },
    queryFn: fetchInterviewers,
    queryKeyBase: ["interviewers", slug],
  });

  // 当前正在查看其引用岗位的面试官；null 时弹窗关闭。
  // The interviewer whose referenced JDs are being inspected; null = closed.
  const [referencedInterviewer, setReferencedInterviewer] = useState<InterviewerListRecord | null>(
    null,
  );

  const canCreateDepartment = useHasPermission("department", "create");
  // 有部门创建权限时可在表单内新建部门，否则没有部门就无法创建面试官。
  // With department create permission the form can add one inline; otherwise no department blocks creation.
  const blockedByDepartments = departments.length === 0 && !canCreateDepartment;

  function invalidateInterviewerData() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["interviewers"] });
    void queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
    void router.invalidate();
  }

  const crud = useEntityCrud<InterviewerListRecord, InterviewerRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio.interviewers[":id"].$delete({ param: { id: record.id, slug } }),
    invalidate: invalidateInterviewerData,
    loadDetail: loadInterviewerDetail,
    messages: {
      deleteSuccess: "面试官 Agent 已删除",
      loadDetailError: "加载面试官 Agent 失败",
    },
    openBeforeLoad: true,
  });

  const filtersConfig = useMemo(
    () => [
      {
        key: "textFilters" as const,
        resource: "interviewers" as const,
        type: "text-filters" as const,
      },
      {
        emptyMessage: "没有匹配的部门",
        key: "departmentId" as const,
        label: "所属部门",
        options: departments.map((d) => ({ label: d.name, value: d.id })),
        placeholder: "全部部门",
        searchPlaceholder: "搜索部门…",
        type: "select" as const,
      },
      ...(canReadJobDescriptions
        ? [
            {
              emptyMessage: jobDescriptionsLoading ? "正在加载岗位…" : "没有匹配的岗位",
              key: "jobDescriptionId" as const,
              label: "关联岗位",
              options: jobDescriptions.map((jd) => ({
                description: jd.departmentName ?? undefined,
                label: jd.name,
                value: jd.id,
              })),
              placeholder: "全部岗位",
              searchPlaceholder: "搜索岗位…",
              type: "select" as const,
            },
          ]
        : []),
    ],
    [canReadJobDescriptions, departments, jobDescriptions, jobDescriptionsLoading],
  );

  return (
    <>
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader title="面试官 Agent" />

        <DataCardList<InterviewerListRecord>
          {...grid.bind}
          cardSkeleton={<InterviewerAgentCardSkeleton />}
          empty={
            blockedByDepartments ? (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconUserCircle className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>请先创建部门</EmptyTitle>
                  <EmptyDescription>
                    面试官 Agent 必须挂在某个部门下，请联系有部门权限的成员在「岗位」中创建部门。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconUserCircle className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>还没有面试官 Agent</EmptyTitle>
                </EmptyHeader>
                {canCreateInterviewer ? (
                  <EmptyContent>
                    <Button onClick={crud.openCreate}>
                      <IconPlus className="size-4" />
                      创建面试官 Agent
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            )
          }
          filters={filtersConfig}
          getRowId={(r) => r.id}
          renderCard={(record) => (
            <InterviewerAgentCard
              onDelete={canDeleteInterviewer ? crud.setDeleteRecord : undefined}
              onEdit={
                canUpdateInterviewer
                  ? (r) => {
                      void crud.openEdit(r);
                    }
                  : undefined
              }
              onOpenJobDescriptions={canReadJobDescriptions ? setReferencedInterviewer : undefined}
              record={record}
            />
          )}
          toolbarRight={
            canCreateInterviewer ? (
              <Button
                className="flex-1 sm:flex-none"
                disabled={blockedByDepartments}
                onClick={crud.openCreate}
              >
                <IconPlus className="size-4" />
                创建面试官 Agent
              </Button>
            ) : null
          }
        />
      </div>

      {(crud.editingRecord ? canUpdateInterviewer : canCreateInterviewer) ? (
        <InterviewerFormDialog
          departments={departments}
          loading={crud.detailLoading}
          onDepartmentCreated={() => router.invalidate()}
          onOpenChange={crud.onFormOpenChange}
          onSaved={invalidateInterviewerData}
          open={crud.formDialogOpen}
          record={crud.editingRecord}
        />
      ) : null}

      <EntityDeleteDialog
        description={(record) =>
          record.jobDescriptionCount > 0
            ? "该面试官 Agent 仍被在招岗位引用，将无法删除。"
            : `即将删除面试官 Agent：${record.name}，删除后无法恢复。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteInterviewer ? crud.deleteRecord : null}
        title="确认删除这个面试官 Agent？"
      />

      <ScopedJobDescriptionsModal
        onChange={() => {
          invalidateInterviewerData();
        }}
        onOpenChange={(next) => {
          if (!next) {
            setReferencedInterviewer(null);
          }
        }}
        open={canReadJobDescriptions && referencedInterviewer !== null}
        scope={
          referencedInterviewer
            ? {
                id: referencedInterviewer.id,
                name: referencedInterviewer.name,
                type: "interviewer",
              }
            : null
        }
      />
    </>
  );
}
