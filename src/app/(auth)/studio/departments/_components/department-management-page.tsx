"use client";

import { PageHeader } from "@/app/(auth)/studio/_components/page-header";
import { EntityDeleteDialog } from "@/app/(auth)/studio/_components/entity-delete-dialog";
import { useEntityCrud } from "@/app/(auth)/studio/_components/use-entity-crud";
import type { DepartmentListRecord, DepartmentRecord } from "@/lib/shared/departments";
import type { PaginatedDepartmentResult } from "@/server/routes/studio/routes/departments/dao";
import { useQueryClient } from "@tanstack/react-query";
import { Building2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";
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
import { DepartmentFormDialog } from "./department-form-dialog";

async function fetchDepartments(params: {
  search: string;
  page: number;
  pageSize: number;
  filters: Record<string, never>;
}): Promise<PaginatedDepartmentResult> {
  const res = await rpc.api.studio.departments.$get({
    query: {
      page: String(params.page),
      pageSize: String(params.pageSize),
      ...(params.search ? { search: params.search } : {}),
      sortBy: "createdAt",
      sortOrder: "desc",
    },
  });
  if (!res.ok) {
    throw new Error("加载部门列表失败");
  }
  return (await res.json()) as PaginatedDepartmentResult;
}

export function DepartmentManagementPage({
  initialData,
}: {
  initialData: PaginatedDepartmentResult;
}) {
  const queryClient = useQueryClient();

  const grid = useDataGridState<DepartmentListRecord, Record<string, never>>({
    fetcher: fetchDepartments,
    initialData,
    initialFilters: {},
    namespace: "departments",
  });

  const crud = useEntityCrud<DepartmentListRecord, DepartmentRecord>({
    deleteEntity: (record) =>
      rpc.api.studio.departments[":id"].$delete({ param: { id: record.id } }),
    detailFromList: (record) => record as unknown as DepartmentRecord,
    invalidate: () => {
      grid.invalidate();
      void queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
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
        cell: (r) => (
          <div className="space-x-2">
            <Badge variant="outline">面试官 {r.interviewerCount}</Badge>
            <Badge variant="outline">在招岗位 {r.jobDescriptionCount}</Badge>
          </div>
        ),
        key: "usage",
        title: "引用情况",
      }),
      dateColumn<DepartmentListRecord>({
        key: "createdAt",
        title: "创建时间",
      }),
      actionsColumn<DepartmentListRecord>({
        inline: [
          {
            icon: PencilIcon,
            label: "编辑部门",
            onClick: (r) => void crud.openEdit(r),
          },
        ],
        menu: [
          {
            icon: Trash2Icon,
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
          description="维护组织下的业务部门，作为面试官和在招岗位的分组维度。"
          title="部门管理"
        />

        <DataGrid<DepartmentListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            <Empty className="border-border/60">
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
        onSaved={() => {
          grid.invalidate();
          void queryClient.invalidateQueries({ queryKey: ["departments"] });
        }}
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
    </>
  );
}
