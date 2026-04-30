"use client";

import type { DepartmentRecord } from "@/lib/departments";
import type { InterviewerListRecord, InterviewerRecord } from "@/lib/interviewers";
import type { PaginatedInterviewerResult } from "@/server/queries/interviewers";
import { useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon, UserCircleIcon } from "lucide-react";
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
import { getMinimaxVoiceMeta } from "@/lib/minimax-voices";
import { InterviewerFormDialog } from "./interviewer-form-dialog";

function fetchInterviewers(params: {
  search: string;
  page: number;
  pageSize: number;
  filters: Record<string, never>;
}): Promise<PaginatedInterviewerResult> {
  const qs = new URLSearchParams();
  if (params.search) {
    qs.set("search", params.search);
  }
  qs.set("page", String(params.page));
  qs.set("pageSize", String(params.pageSize));
  qs.set("sortBy", "createdAt");
  qs.set("sortOrder", "desc");
  return apiFetch<PaginatedInterviewerResult>(`/api/studio/interviewers?${qs.toString()}`);
}

async function loadInterviewerDetail(id: string): Promise<InterviewerRecord | null> {
  const response = await fetch(`/api/studio/interviewers/${id}`);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as InterviewerRecord;
}

export function InterviewerManagementPage({
  initialData,
  departments,
}: {
  initialData: PaginatedInterviewerResult;
  departments: DepartmentRecord[];
}) {
  const queryClient = useQueryClient();

  const grid = useDataGridState<InterviewerListRecord, Record<string, never>>({
    fetcher: fetchInterviewers,
    initialData,
    initialFilters: {},
    namespace: "interviewers",
  });

  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<InterviewerRecord | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<InterviewerListRecord | null>(null);

  const noDepartments = departments.length === 0;

  function invalidateAll() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
  }

  function openCreate() {
    setEditingRecord(null);
    setFormDialogOpen(true);
  }

  async function openEdit(record: InterviewerListRecord) {
    const full = await loadInterviewerDetail(record.id);
    if (!full) {
      toast.error("加载面试官失败");
      return;
    }
    setEditingRecord(full);
    setFormDialogOpen(true);
  }

  async function handleDelete() {
    if (!deleteRecord) {
      return;
    }
    const response = await fetch(`/api/studio/interviewers/${deleteRecord.id}`, {
      method: "DELETE",
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      toast.error(payload?.error ?? "删除失败");
      return;
    }
    setDeleteRecord(null);
    toast.success("面试官已删除");
    invalidateAll();
  }

  const columns = useMemo(
    () => [
      textColumn<InterviewerListRecord>({
        key: "name",
        primary: true,
        secondary: (r) => r.description || "—",
        title: "名称",
      }),
      customColumn<InterviewerListRecord>({
        cell: (r) => r.departmentName ?? <Badge variant="outline">未知</Badge>,
        key: "departmentName",
        title: "所属部门",
      }),
      customColumn<InterviewerListRecord>({
        cell: (r) => {
          const voiceMeta = getMinimaxVoiceMeta(r.voice);
          return (
            <div className="flex flex-col">
              <span className="font-medium text-foreground text-sm">
                {voiceMeta?.label ?? r.voice}
              </span>
              <span className="truncate text-muted-foreground text-xs">
                {voiceMeta?.description ?? ""}
              </span>
            </div>
          );
        },
        key: "voice",
        title: "音色",
      }),
      customColumn<InterviewerListRecord>({
        cell: (r) => <Badge variant="outline">{r.jobDescriptionCount}</Badge>,
        key: "jobDescriptionCount",
        title: "引用岗位",
      }),
      dateColumn<InterviewerListRecord>({
        key: "createdAt",
        title: "创建时间",
      }),
      actionsColumn<InterviewerListRecord>({
        inline: [
          {
            icon: PencilIcon,
            label: "编辑面试官",
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
        placeholder: "搜索名称或描述",
        type: "search" as const,
      },
    ],
    [],
  );

  return (
    <>
      <div className="space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl">面试官管理</h1>
          <p className="text-muted-foreground text-sm">
            配置 AI 面试官的 prompt 和 TTS 音色，在招岗位会引用这些面试官。
          </p>
        </header>

        <DataGrid<InterviewerListRecord>
          {...grid.bind}
          columns={columns}
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            <Button
              className="flex-1 sm:flex-none"
              disabled={noDepartments}
              onClick={openCreate}
              variant="outline"
            >
              <PlusIcon className="size-4" />
              新建面试官
            </Button>
          }
          empty={
            noDepartments ? (
              <Empty className="border-border/60">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserCircleIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>请先创建部门</EmptyTitle>
                  <EmptyDescription>
                    面试官必须挂在某个部门下，先去「部门管理」创建一个部门。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty className="border-border/60">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <UserCircleIcon className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>还没有面试官</EmptyTitle>
                  <EmptyDescription>
                    新建一个面试官，配置 prompt 和音色后即可供在招岗位引用。
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={openCreate} variant="outline">
                    <PlusIcon className="size-4" />
                    新建面试官
                  </Button>
                </EmptyContent>
              </Empty>
            )
          }
        />
      </div>

      <InterviewerFormDialog
        departments={departments}
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
            <AlertDialogTitle>确认删除这个面试官？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRecord && deleteRecord.jobDescriptionCount > 0
                ? "该面试官仍被在招岗位引用，将无法删除。"
                : `即将删除面试官：${deleteRecord?.name ?? ""}，删除后无法恢复。`}
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
