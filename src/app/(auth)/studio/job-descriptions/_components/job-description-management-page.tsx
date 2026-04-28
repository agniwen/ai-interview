"use client";

import type { DepartmentRecord } from "@/lib/departments";
import type { InterviewerListRecord } from "@/lib/interviewers";
import type { JobDescriptionListRecord, JobDescriptionRecord } from "@/lib/job-descriptions";
import type { PaginatedJobDescriptionResult } from "@/server/queries/job-descriptions";
import { useQueryClient } from "@tanstack/react-query";
import { FileTextIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { JobDescriptionFormDialog } from "./job-description-form-dialog";

function fetchJobDescriptions(params: {
  search: string;
  page: number;
  pageSize: number;
  filters: Record<string, never>;
}): Promise<PaginatedJobDescriptionResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", "createdAt");
  qs.set("sortOrder", "desc");
  return apiFetch<PaginatedJobDescriptionResult>(`/api/studio/job-descriptions?${qs.toString()}`);
}

async function loadJobDescriptionDetail(id: string): Promise<JobDescriptionRecord | null> {
  const response = await fetch(`/api/studio/job-descriptions/${id}`);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as JobDescriptionRecord;
}

export function JobDescriptionManagementPage({
  initialData,
  departments,
  interviewers,
}: {
  initialData: PaginatedJobDescriptionResult;
  departments: DepartmentRecord[];
  interviewers: InterviewerListRecord[];
}) {
  const queryClient = useQueryClient();

  const grid = useDataGridState<JobDescriptionListRecord, Record<string, never>>({
    fetcher: fetchJobDescriptions,
    initialData,
    initialFilters: {},
    namespace: "job-descriptions",
  });

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<JobDescriptionRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<JobDescriptionListRecord | null>(null);

  const missingRefs = departments.length === 0 || interviewers.length === 0;

  function invalidateAll() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["interviewers"] });
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
  }

  function openCreate() {
    setEditingRecord(null);
    setFormDialogOpen(true);
  }

  async function openEdit(record: JobDescriptionListRecord) {
    const full = await loadJobDescriptionDetail(record.id);
    if (!full) {
      toast.error("加载在招岗位失败");
      return;
    }
    setEditingRecord(full);
    setFormDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    const response = await fetch(`/api/studio/job-descriptions/${deleteRecord.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      toast.error(payload?.error ?? "删除失败");
      return;
    }
    setDeleteRecord(null);
    toast.success("在招岗位已删除");
    invalidateAll();
  }

  const columns = useMemo(
    () => [
      textColumn<JobDescriptionListRecord>({
        key: "name",
        primary: true,
        title: "岗位名称",
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
        cell: (r) => (
          <span className="max-w-sm truncate text-muted-foreground text-sm">
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
            icon: PencilIcon,
            label: "编辑岗位",
            onClick: (r) => {
              void openEdit(r);
            },
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
        placeholder: "搜索在招岗位名称或描述",
        type: "search" as const,
      },
    ],
    [],
  );

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">在招岗位管理</h1>
          <p className="text-muted-foreground text-sm">
            配置岗位描述 prompt，并指定面试时要启用的面试官。
          </p>
        </header>

        <DataGrid<JobDescriptionListRecord>
          {...grid.bind}
          columns={columns}
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            <Button
              className="flex-1 sm:flex-none"
              data-tour="studio-jobs-create"
              disabled={missingRefs}
              onClick={openCreate}
              variant="outline"
            >
              <PlusIcon className="size-4" />
              新建在招岗位
            </Button>
          }
          empty={
            missingRefs ? (
              <Empty className="border-border/60">
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
              <Empty className="border-border/60">
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
                  <Button onClick={openCreate} variant="outline">
                    <PlusIcon className="size-4" />
                    新建在招岗位
                  </Button>
                </EmptyContent>
              </Empty>
            )
          }
          dataTour={{
            create: "studio-jobs-create",
            search: "studio-jobs-search",
            table: "studio-jobs-table",
          }}
        />
      </div>

      <JobDescriptionFormDialog
        departments={departments}
        interviewers={interviewers}
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
            <AlertDialogTitle>确认删除这个在招岗位？</AlertDialogTitle>
            <AlertDialogDescription>
              即将删除岗位：{deleteRecord?.name ?? ""}，引用该岗位的面试记录的关联岗位字段会被清空。
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
