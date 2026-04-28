"use client";

import type { DepartmentListRecord, DepartmentRecord } from "@/lib/departments";
import type { PaginatedDepartmentResult } from "@/server/queries/departments";
import { useQueryClient } from "@tanstack/react-query";
import { Building2Icon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { apiFetch } from "@/lib/api";
import { DepartmentFormDialog } from "./department-form-dialog";

function fetchDepartments(params: {
  search: string;
  page: number;
  pageSize: number;
  filters: Record<string, never>;
}): Promise<PaginatedDepartmentResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", "createdAt");
  qs.set("sortOrder", "desc");
  return apiFetch<PaginatedDepartmentResult>(`/api/studio/departments?${qs.toString()}`);
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

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DepartmentRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<DepartmentListRecord | null>(null);

  function invalidateAll() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
  }

  function openCreate() {
    setEditingRecord(null);
    setFormDialogOpen(true);
  }

  function openEdit(record: DepartmentListRecord) {
    setEditingRecord(record);
    setFormDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    const response = await fetch(`/api/studio/departments/${deleteRecord.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      toast.error(payload?.error ?? "删除失败");
      return;
    }
    setDeleteRecord(null);
    toast.success("部门已删除");
    invalidateAll();
  }

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
            onClick: (r) => openEdit(r),
          },
        ],
        menu: [
          {
            icon: Trash2Icon,
            label: "删除",
            onClick: (r) => setDeleteRecord(r),
            variant: "destructive",
          },
        ],
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">部门管理</h1>
          <p className="text-muted-foreground text-sm">
            维护组织下的业务部门，作为面试官和在招岗位的分组维度。
          </p>
        </header>

        <DataGrid<DepartmentListRecord>
          {...grid.bind}
          columns={columns}
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            <Button
              className="flex-1 sm:flex-none"
              data-tour="studio-departments-create"
              onClick={openCreate}
              variant="outline"
            >
              <PlusIcon className="size-4" />
              新建部门
            </Button>
          }
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
                <Button onClick={openCreate} variant="outline">
                  <PlusIcon className="size-4" />
                  新建部门
                </Button>
              </EmptyContent>
            </Empty>
          }
          dataTour={{
            create: "studio-departments-create",
            search: "studio-departments-search",
            table: "studio-departments-table",
          }}
        />
      </div>

      <DepartmentFormDialog
        onOpenChange={(value) => {
          setFormDialogOpen(value);
          if (!value) {
            setEditingRecord(null);
          }
        }}
        onSaved={() => invalidateAll()}
        open={formDialogOpen}
        record={editingRecord}
      />

      <AlertDialog
        onOpenChange={(value) => !value && setDeleteRecord(null)}
        open={deleteRecord !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除这个部门？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRecord &&
              (deleteRecord.interviewerCount > 0 || deleteRecord.jobDescriptionCount > 0)
                ? "该部门下仍有面试官或在招岗位，将无法删除。"
                : `即将删除部门：${deleteRecord?.name ?? ""}，删除后无法恢复。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} variant="destructive">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
