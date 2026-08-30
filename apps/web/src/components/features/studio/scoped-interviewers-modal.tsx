"use client";

// 部门下面试官的弹窗（自身只读，但内部"引用岗位"列可以嵌套打开 JD 弹窗）。
// 部门页用这个查看"哪些面试官归属于某个部门"。面试官本身的删除应该回到面试官
// 管理页做（那里有"被多少 JD 引用"硬约束的提示），但每一行的"引用岗位"列
// 复用同一份 ScopedJobDescriptionsModal（scope=interviewer），允许在嵌套
// 弹窗里删除岗位。
//
// Listing modal for interviewers under a department. The modal itself is
// read-only over interviewers, but each row's "referenced JDs" cell opens a
// nested ScopedJobDescriptionsModal (scope=interviewer) reused from the
// interviewer page, which DOES support row-level JD delete.

import type { InterviewerListRecord } from "@arc/shared/interviewers";
import type { PaginatedInterviewerResult } from "@app/server/server/routes/studio/routes/interviewers/dao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { customColumn, DataGrid, textColumn } from "@/components/data-grid";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useModalPagination } from "@/lib/client/use-modal-pagination";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { getMinimaxVoiceMeta } from "@arc/db-schema/minimax-voices";
import { useHasPermission } from "@/hooks/use-has-permission";
import { ScopedJobDescriptionsModal } from "./scoped-job-descriptions-modal";

interface ScopedInterviewersModalProps {
  /** 当前部门 scope；null 时弹窗关闭（也意味着不发请求）。 */
  departmentId: string | null;
  departmentName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * 嵌套 JD 弹窗里有 JD 被删时回调，让父级（部门页）刷新部门表的引用计数。
   * Nested JD modal deletes bubble up so the parent (department page) can
   * refresh its JD-count column.
   */
  onChange?: () => void;
}

const DEFAULT_PAGE_SIZE = 10;
const QUERY_KEY_PREFIX = "scoped-interviewers" as const;

export function ScopedInterviewersModal({
  departmentId,
  departmentName,
  open,
  onOpenChange,
  onChange,
}: ScopedInterviewersModalProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const canReadJobDescriptions = useHasPermission("jd", "read");
  const { page, pageSize, setPage, setPageSize } = useModalPagination(DEFAULT_PAGE_SIZE);
  // 当前点开"引用岗位"的那位面试官；null 时嵌套 JD 弹窗关闭。
  // The interviewer whose referenced JDs are being inspected; null = closed.
  const [nestedInterviewer, setNestedInterviewer] = useState<InterviewerListRecord | null>(null);

  const listQuery = useQuery({
    enabled: open && departmentId !== null,
    placeholderData: (prev) => prev,
    queryFn: (): Promise<PaginatedInterviewerResult> => {
      if (!departmentId) {
        return Promise.resolve({ page, pageSize, records: [], total: 0, totalPages: 1 });
      }
      return rpcFetch(
        rpc.api.w[":slug"].studio.interviewers.$get({
          param: { slug },
          query: {
            departmentId,
            page: String(page),
            pageSize: String(pageSize),
            sortBy: "createdAt",
            sortOrder: "desc",
          },
        }),
        "加载面试官失败",
      );
    },
    queryKey: [QUERY_KEY_PREFIX, slug, departmentId, page, pageSize] as const,
    staleTime: 30 * 1000,
  });

  const data = listQuery.data ?? {
    page,
    pageSize,
    records: [],
    total: 0,
    totalPages: 1,
  };

  // 列设计跟面试官管理页保持一致：0 引用纯文本，>0 link 按钮打开嵌套 JD 弹窗。
  // Mirrors the interviewer management page conventions: zero refs render as
  // plain text, positive counts open the nested JD modal.
  const columns = useMemo(
    () => [
      textColumn<InterviewerListRecord>({
        key: "name",
        primary: true,
        secondary: (r) => r.description || "—",
        title: "名称",
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
          if (r.jobDescriptionCount === 0 || !canReadJobDescriptions) {
            return `${r.jobDescriptionCount} 个岗位`;
          }
          return (
            <Button
              className="h-auto p-0 font-medium text-primary"
              onClick={() => setNestedInterviewer(r)}
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
    ],
    [canReadJobDescriptions],
  );

  return (
    <>
      <Modal
        onOpenChange={onOpenChange}
        open={open}
        size="2xl"
        title={`部门「${departmentName}」下的面试官`}
      >
        <DataGrid<InterviewerListRecord>
          columns={columns}
          data={data.records}
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyTitle>暂无面试官</EmptyTitle>
                <EmptyDescription>当前部门「{departmentName}」下没有任何面试官。</EmptyDescription>
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

      {/* 嵌套：本 modal 内的面试官行点击"引用岗位"打开 scope=interviewer 的 JD modal。
          关闭嵌套 modal 不影响外层；嵌套删 JD 时除了刷新当前面试官列表（引用计数变），
          也通过 onChange 把信号向上传给部门页刷新部门表的 jobDescriptionCount。
          Nested: a row's "referenced JDs" cell opens scope=interviewer JD modal.
          Closing the inner modal doesn't propagate to the outer. JD deletes
          invalidate this modal's interviewer list AND bubble up via onChange
          so the department page can refresh its JD-count column. */}
      <ScopedJobDescriptionsModal
        onChange={() => {
          void queryClient.invalidateQueries({ queryKey: [QUERY_KEY_PREFIX] });
          onChange?.();
        }}
        onOpenChange={(next) => {
          if (!next) {
            setNestedInterviewer(null);
          }
        }}
        open={canReadJobDescriptions && nestedInterviewer !== null}
        scope={
          nestedInterviewer
            ? { id: nestedInterviewer.id, name: nestedInterviewer.name, type: "interviewer" }
            : null
        }
      />
    </>
  );
}
