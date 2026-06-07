"use client";

import { PageHeader } from "@/app/(auth)/w/[slug]/studio/_components/page-header";
import { EntityDeleteDialog } from "@/app/(auth)/w/[slug]/studio/_components/entity-delete-dialog";
import { useEntityCrud } from "@/app/(auth)/w/[slug]/studio/_components/use-entity-crud";
import type { DepartmentRecord } from "@arc/shared/departments";
import type { InterviewerListRecord, InterviewerRecord } from "@arc/shared/interviewers";
import type { PaginatedInterviewerResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao";
import { useQueryClient } from "@tanstack/react-query";
import { PlusIcon, UserCircleIcon } from "lucide-react";
import { useMemo, useState } from "react";
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
import { getMinimaxVoiceMeta } from "@arc/db-schema/minimax-voices";
import { ScopedJobDescriptionsModal } from "@/app/(auth)/w/[slug]/studio/_components/scoped-job-descriptions-modal";
import { InterviewerFormDialog } from "./interviewer-form-dialog";

export function InterviewerManagementPage({ departments }: { departments: DepartmentRecord[] }) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

  const fetchInterviewers = useMemo(
    () =>
      async (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: Record<string, never>;
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }): Promise<PaginatedInterviewerResult> => {
        const res = await rpc.api.w[":slug"].studio.interviewers.$get({
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
          throw new Error("加载面试官列表失败");
        }
        return (await res.json()) as PaginatedInterviewerResult;
      },
    [slug],
  );

  async function loadInterviewerDetail(
    record: InterviewerListRecord,
  ): Promise<InterviewerRecord | null> {
    const response = await rpc.api.w[":slug"].studio.interviewers[":id"].$get({
      param: { id: record.id, slug },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as InterviewerRecord;
  }

  const grid = useDataGridState<InterviewerListRecord, Record<string, never>>({
    allowedSortIds: ["createdAt", "name", "updatedAt"],
    defaultSorting: [{ desc: true, id: "createdAt" }],
    initialFilters: {},
    queryFn: fetchInterviewers,
    queryKeyBase: ["interviewers", slug],
  });

  // 当前正在查看其引用岗位的面试官；null 时弹窗关闭。
  // The interviewer whose referenced JDs are being inspected; null = closed.
  const [referencedInterviewer, setReferencedInterviewer] = useState<InterviewerListRecord | null>(
    null,
  );

  const noDepartments = departments.length === 0;

  const crud = useEntityCrud<InterviewerListRecord, InterviewerRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio.interviewers[":id"].$delete({ param: { id: record.id, slug } }),
    invalidate: () => {
      grid.invalidate();
      void queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    loadDetail: loadInterviewerDetail,
    messages: {
      deleteSuccess: "面试官已删除",
      loadDetailError: "加载面试官失败",
    },
  });

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
        cell: (r) => {
          // 0 引用时保持纯展示 Badge（没有内容可弹）；>0 时改成 link 按钮，点击打开
          // 详情弹窗，里面允许删除某条岗位。
          // Zero references stay as a plain badge (nothing to open); positive
          // counts become a link button that opens the JD detail modal.
          if (r.jobDescriptionCount === 0) {
            return "0个岗位";
          }
          return (
            <Button
              className="h-auto p-0 font-medium text-primary"
              onClick={() => setReferencedInterviewer(r)}
              type="button"
              variant="link"
            >
              {r.jobDescriptionCount} 个岗位
            </Button>
          );
        },
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
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- columns 不应跟着 crud 引用变化重建
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
        <PageHeader
          description="维护不同部门的 AI 面试官、追问风格和声音，让每个岗位都能匹配合适的面试方式。"
          title="面试官"
        />

        <DataGrid<InterviewerListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            noDepartments ? (
              <Empty className="border-border">
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
              <Empty className="border-border">
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
                  <Button onClick={crud.openCreate}>
                    <PlusIcon className="size-4" />
                    新建面试官
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
              disabled={noDepartments}
              onClick={crud.openCreate}
            >
              <PlusIcon className="size-4" />
              新建面试官
            </Button>
          }
        />
      </div>

      <InterviewerFormDialog
        departments={departments}
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
          record.jobDescriptionCount > 0
            ? "该面试官仍被在招岗位引用，将无法删除。"
            : `即将删除面试官：${record.name}，删除后无法恢复。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={crud.deleteRecord}
        title="确认删除这个面试官？"
      />

      <ScopedJobDescriptionsModal
        onChange={() => {
          // 弹窗里删了岗位 → 主表的 jobDescriptionCount 会变，刷新一下。
          // JD deletion inside the modal mutates jobDescriptionCount; refresh the
          // parent grid so the count reflects reality.
          grid.invalidate();
          void queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
        }}
        onOpenChange={(next) => {
          if (!next) {
            setReferencedInterviewer(null);
          }
        }}
        open={referencedInterviewer !== null}
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
