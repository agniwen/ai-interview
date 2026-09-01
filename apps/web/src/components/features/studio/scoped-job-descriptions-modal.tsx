"use client";

// 通用"按 scope 查看 + 删除在招岗位"弹窗。
//
// scope 可以是某位面试官（看哪些 JD 引用了他）或某个部门（看部门下的 JD）。
// 两种 scope 共用同一份表格列结构和删除流程，仅 title / query 维度不同。
//
// 主表 page-state 走路由 URL 同步；这里 Modal 内部如果再用 useDataGridState
// 会跟主表 URL key 冲突（page/pageSize/search 都是裸 key），所以这里改用本地
// useState + useQuery 自管 state。
//
// Reusable "view + delete JDs under a scope" modal.
// Scope is either an interviewer (which JDs reference them) or a department
// (which JDs live under it). Both share the same column structure and delete
// flow — only title / query dimension differ.
// Local useState + useQuery is used instead of the parent's `useDataGridState`
// to avoid colliding on the bare `page` / `search` / etc query keys.
import { apiResponse } from "@/lib/client/api/rpc-fetch";
import {
  deleteWorkspaceJobDescription,
  listWorkspaceJobDescriptions,
} from "@/lib/client/backend-api";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import type { PaginatedJobDescriptionResult } from "@app/server/server/routes/studio/routes/job-descriptions/dao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { actionsColumn, customColumn, DataGrid, textColumn } from "@/components/features/data-grid";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { apiRequest } from "@/lib/client/api";

import { useModalPagination } from "@/lib/client/use-modal-pagination";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useHasPermission } from "@/hooks/use-has-permission";

// 二选一的 scope：决定按什么维度过滤 JD，以及弹窗 title 怎么拼。
// Discriminated scope: determines the filter dimension + how the title reads.
export type JobDescriptionsScope =
  | { type: "interviewer"; id: string; name: string }
  | { type: "department"; id: string; name: string };

interface ScopedJobDescriptionsModalProps {
  /** 当前 scope；null 时弹窗整体关闭（也意味着不发请求）。 */
  scope: JobDescriptionsScope | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 任意 JD 删除成功后回调，父级用来 invalidate 各自的列表缓存
   * （面试官页要刷引用计数；部门页要刷下属岗位计数）。
   * Called after any JD deletion so the parent can refresh its list cache —
   * interviewer page refreshes reference counts, department page refreshes
   * the per-department JD counter.
   */
  onChange?: () => void;
}

const DEFAULT_PAGE_SIZE = 10;
// queryKey 前缀，作为 invalidateQueries 的最小公共前缀。
// Common prefix for selective invalidation across both scope types.
const QUERY_KEY_PREFIX = "scoped-job-descriptions" as const;

function buildTitle(scope: JobDescriptionsScope): string {
  if (scope.type === "interviewer") {
    return `引用「${scope.name}」的在招岗位`;
  }
  return `部门「${scope.name}」下的在招岗位`;
}

function buildEmptyDescription(scope: JobDescriptionsScope): string {
  if (scope.type === "interviewer") {
    return `当前没有任何在招岗位引用「${scope.name}」。可以关闭弹窗后删除这位面试官。`;
  }
  return `当前部门「${scope.name}」下没有任何在招岗位。`;
}

export function ScopedJobDescriptionsModal({
  scope,
  open,
  onOpenChange,
  onChange,
}: ScopedJobDescriptionsModalProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const canDeleteJobDescription = useHasPermission("jd", "delete");

  const { page, pageSize, setPage, setPageSize } = useModalPagination(DEFAULT_PAGE_SIZE);

  const listQuery = useQuery({
    enabled: open && scope !== null,
    placeholderData: (prev) => prev,
    queryFn: (): Promise<PaginatedJobDescriptionResult> => {
      if (!scope) {
        return Promise.resolve({ page, pageSize, records: [], total: 0, totalPages: 1 });
      }
      // 两种 scope 都走 JD 列表 RPC，过滤维度通过 query key 区分。
      // Both scopes hit the same JD list RPC; differ only by which filter key.
      const scopedQuery =
        scope.type === "interviewer" ? { interviewerId: scope.id } : { departmentId: scope.id };
      return apiRequest(
        listWorkspaceJobDescriptions({
          path: { workspaceSlug: slug },
          query: {
            ...scopedQuery,
            page,
            pageSize,
            sortBy: "createdAt",
            sortOrder: "desc",
          },
        }),

        "加载在招岗位失败",
      );
    },
    // scope 变更时自动重新查询；type + id 组成唯一 key。
    // Re-query on scope change; type + id together form the unique key.
    queryKey: [
      QUERY_KEY_PREFIX,
      slug,
      scope?.type ?? null,
      scope?.id ?? null,
      page,
      pageSize,
    ] as const,
    staleTime: 30 * 1000,
  });

  const data = listQuery.data ?? {
    page,
    pageSize,
    records: [],
    total: 0,
    totalPages: 1,
  };

  const crud = useEntityCrud<JobDescriptionListRecord, JobDescriptionListRecord>({
    deleteEntity: (record) =>
      apiResponse(deleteWorkspaceJobDescription({ path: { id: record.id, workspaceSlug: slug } })),

    invalidate: () => {
      void queryClient.invalidateQueries({ queryKey: [QUERY_KEY_PREFIX] });
      onChange?.();
    },
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
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => r.departmentName ?? <Badge variant="outline">未知</Badge>,
        key: "departmentName",
        title: "部门",
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
      actionsColumn<JobDescriptionListRecord>({
        menu: [
          {
            label: "删除",
            onClick: (r) => crud.setDeleteRecord(r),
            show: () => canDeleteJobDescription,
            variant: "destructive",
          },
        ],
      }),
    ],

    // oxlint-disable-next-line react-hooks/exhaustive-deps -- columns 不应跟着 crud 引用变化重建
    [canDeleteJobDescription],
  );

  return (
    <>
      <Modal
        description="可在表格内删除某个岗位；删除会同时解除该岗位与所有面试官的关联，且无法恢复。"
        onOpenChange={onOpenChange}
        open={open}
        size="2xl"
        title={scope ? buildTitle(scope) : ""}
      >
        <DataGrid<JobDescriptionListRecord>
          columns={columns}
          data={data.records}
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyTitle>暂无在招岗位</EmptyTitle>
                <EmptyDescription>{scope ? buildEmptyDescription(scope) : ""}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          }
          getRowId={(r) => r.id}
          loading={listQuery.isFetching && !listQuery.isRefetching}
          maxHeight={null}
          pagination={{
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
            page: data.page,
            pageSize: data.pageSize,
          }}
          refetching={listQuery.isRefetching}
          total={data.total}
          totalPages={data.totalPages}
        />
      </Modal>

      <EntityDeleteDialog
        description={(record) =>
          `即将删除在招岗位：${record.name}，删除后无法恢复，且其与所有面试官的关联会被一并清除。`
        }
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteJobDescription ? crud.deleteRecord : null}
        title="确认删除这个在招岗位？"
      />
    </>
  );
}
