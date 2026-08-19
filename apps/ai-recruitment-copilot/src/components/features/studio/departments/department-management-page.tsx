import { IconBuilding, IconPlus } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { PageHeader } from "@/components/features/studio/page-header";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { ScopedInterviewersModal } from "@/components/features/studio/scoped-interviewers-modal";
import { ScopedJobDescriptionsModal } from "@/components/features/studio/scoped-job-descriptions-modal";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import type { DepartmentListRecord, DepartmentRecord } from "@arc/shared/departments";
import type { PaginatedDepartmentResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/departments/dao";

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
import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { DepartmentFormDialog } from "@/components/features/studio/departments/department-form-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";

export function DepartmentManagementPage() {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canCreateDepartment = useHasPermission("department", "create");
  const canUpdateDepartment = useHasPermission("department", "update");
  const canDeleteDepartment = useHasPermission("department", "delete");
  const canReadInterviewers = useHasPermission("interviewer", "read");
  const canReadJobDescriptions = useHasPermission("jd", "read");

  const fetchDepartments = useMemo(
    () =>
      (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: Record<string, never>;
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }): Promise<PaginatedDepartmentResult> => {
        const query = {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy ?? "createdAt",
          sortOrder: params.sortOrder ?? "desc",
        };
        if (params.search) {
          Object.assign(query, { search: params.search });
        }
        return rpcFetch<PaginatedDepartmentResult>(
          rpc.api.w[":slug"].studio.departments.$get({
            param: { slug },
            query,
          }),
          "加载部门列表失败",
        );
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
    detailFromList: (record) => record,
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
          if (r.interviewerCount === 0 || !canReadInterviewers) {
            return `${r.interviewerCount} 位面试官`;
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
          if (r.jobDescriptionCount === 0 || !canReadJobDescriptions) {
            return `${r.jobDescriptionCount} 个岗位`;
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
            onClick: (record) => crud.openEdit(record),
            show: () => canUpdateDepartment,
          },
        ],
        menu: [
          {
            label: "删除",
            onClick: (r) => crud.setDeleteRecord(r),
            show: () => canDeleteDepartment,
            variant: "destructive",
          },
        ],
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- columns 不应每次 crud 引用变化都重建
    [canDeleteDepartment, canReadInterviewers, canReadJobDescriptions, canUpdateDepartment],
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
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader title="部门管理" />

        <DataGrid<DepartmentListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <IconBuilding className="size-5" />
                </EmptyMedia>
                <EmptyTitle>还没有部门</EmptyTitle>
              </EmptyHeader>
              {canCreateDepartment ? (
                <EmptyContent>
                  <Button onClick={crud.openCreate}>
                    <IconPlus className="size-4" />
                    创建部门
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          }
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            canCreateDepartment ? (
              <Button className="flex-1 sm:flex-none" onClick={crud.openCreate}>
                <IconPlus className="size-4" />
                创建部门
              </Button>
            ) : null
          }
        />
      </div>

      {(crud.editingRecord ? canUpdateDepartment : canCreateDepartment) ? (
        <DepartmentFormDialog
          onOpenChange={crud.onFormOpenChange}
          onSaved={invalidateDepartmentData}
          open={crud.formDialogOpen}
          record={crud.editingRecord}
        />
      ) : null}

      <EntityDeleteDialog
        description={(record) =>
          record.interviewerCount > 0 || record.jobDescriptionCount > 0
            ? "该部门下仍有面试官或在招岗位，将无法删除。"
            : `即将删除部门：${record.name}，删除后无法恢复。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteDepartment ? crud.deleteRecord : null}
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
        open={canReadInterviewers && interviewersModalDept !== null}
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
        open={canReadJobDescriptions && jobDescriptionsModalDept !== null}
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
