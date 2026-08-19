import { IconPlus, IconUserCircle } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import type { DepartmentRecord } from "@arc/shared/departments";
import { PageHeader } from "@/components/features/studio/page-header";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import type { InterviewerListRecord, InterviewerRecord } from "@arc/shared/interviewers";
import type { PaginatedInterviewerResult } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviewers/dao";

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
import { rpcFetch } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { getMinimaxVoiceMeta } from "@arc/db-schema/minimax-voices";
import { ScopedJobDescriptionsModal } from "@/components/features/studio/scoped-job-descriptions-modal";
import { InterviewerFormDialog } from "@/components/features/studio/interviewers/interviewer-form-dialog";
import { useHasPermission } from "@/hooks/use-has-permission";

export function InterviewerManagementPage({ departments }: { departments: DepartmentRecord[] }) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canCreateInterviewer = useHasPermission("interviewer", "create");
  const canUpdateInterviewer = useHasPermission("interviewer", "update");
  const canDeleteInterviewer = useHasPermission("interviewer", "delete");
  const canReadJobDescriptions = useHasPermission("jd", "read");

  const fetchInterviewers = useMemo(
    () =>
      (params: {
        search: string;
        page: number;
        pageSize: number;
        filters: Record<string, never>;
        sortBy: string | undefined;
        sortOrder: "asc" | "desc" | undefined;
      }): Promise<PaginatedInterviewerResult> =>
        rpcFetch<PaginatedInterviewerResult>(
          rpc.api.w[":slug"].studio.interviewers.$get({
            param: { slug },
            query: {
              page: String(params.page),
              pageSize: String(params.pageSize),
              search: params.search || undefined,
              sortBy: params.sortBy ?? "createdAt",
              sortOrder: params.sortOrder ?? "desc",
            },
          }),
          "加载 AI面试官列表失败",
        ),
    [slug],
  );

  function loadInterviewerDetail(record: InterviewerListRecord): Promise<InterviewerRecord | null> {
    return rpcFetch<InterviewerRecord>(
      rpc.api.w[":slug"].studio.interviewers[":id"].$get({
        param: { id: record.id, slug },
      }),
      "加载 AI 面试官详情失败",
      { allow404: true },
    );
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

  function invalidateInterviewerData() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["interviewers"] });
    void queryClient.invalidateQueries({ queryKey: ["departments"] });
    void queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
    void router.invalidate();
  }

  const crud = useEntityCrud<InterviewerListRecord, InterviewerRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio.interviewers[":id"].$delete({ param: { id: record.id, slug } }),
    invalidate: invalidateInterviewerData,
    loadDetail: loadInterviewerDetail,
    messages: {
      deleteSuccess: "AI面试官已删除",
      loadDetailError: "加载 AI面试官失败",
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
          if (r.jobDescriptionCount === 0 || !canReadJobDescriptions) {
            return `${r.jobDescriptionCount} 个岗位`;
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
            show: () => canUpdateInterviewer,
          },
        ],
        menu: [
          {
            label: "删除",
            onClick: (r) => crud.setDeleteRecord(r),
            show: () => canDeleteInterviewer,
            variant: "destructive",
          },
        ],
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- columns 不应跟着 crud 引用变化重建
    [canDeleteInterviewer, canReadJobDescriptions, canUpdateInterviewer],
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
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader title="AI面试官管理" />

        <DataGrid<InterviewerListRecord>
          {...grid.bind}
          columns={columns}
          empty={
            noDepartments ? (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconUserCircle className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>请先创建部门</EmptyTitle>
                  <EmptyDescription>
                    AI面试官必须挂在某个部门下，先去「部门管理」创建一个部门。
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <Empty className="border-border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <IconUserCircle className="size-5" />
                  </EmptyMedia>
                  <EmptyTitle>还没有 AI面试官</EmptyTitle>
                </EmptyHeader>
                {canCreateInterviewer ? (
                  <EmptyContent>
                    <Button onClick={crud.openCreate}>
                      <IconPlus className="size-4" />
                      创建AI面试官
                    </Button>
                  </EmptyContent>
                ) : null}
              </Empty>
            )
          }
          filters={filtersConfig}
          getRowId={(r) => r.id}
          toolbarRight={
            canCreateInterviewer ? (
              <Button
                className="flex-1 sm:flex-none"
                disabled={noDepartments}
                onClick={crud.openCreate}
              >
                <IconPlus className="size-4" />
                创建AI面试官
              </Button>
            ) : null
          }
        />
      </div>

      {(crud.editingRecord ? canUpdateInterviewer : canCreateInterviewer) ? (
        <InterviewerFormDialog
          departments={departments}
          onOpenChange={crud.onFormOpenChange}
          onSaved={invalidateInterviewerData}
          open={crud.formDialogOpen}
          record={crud.editingRecord}
        />
      ) : null}

      <EntityDeleteDialog
        description={(record) =>
          record.jobDescriptionCount > 0
            ? "该 AI面试官仍被在招岗位引用，将无法删除。"
            : `即将删除 AI面试官：${record.name}，删除后无法恢复。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteInterviewer ? crud.deleteRecord : null}
        title="确认删除这个 AI面试官？"
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
