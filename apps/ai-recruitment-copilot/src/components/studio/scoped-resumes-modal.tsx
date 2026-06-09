"use client";

// 在招岗位行点击"简历关联"列时弹出的弹窗：列出关联到该岗位的非归档候选人 / 简历。
// 行内点击候选人姓名可弹出简历详情弹窗（StudioPersonDetailDialog mode="resume"），
// 详情弹窗叠在本弹窗之上，关闭它不会影响外层；不支持新建 / 删除（仍在简历库主页面完成）。
//
// 自管 page/pageSize（useModalPagination）以避开主表 URL key 冲突。
//
// Read-only mini resume library scoped to a single JD, opened from the JD
// management table's "resume association" column. Clicking a candidate row
// opens the same StudioPersonDetailDialog used by the resume library; that
// dialog stacks on top via Radix and closing it leaves this modal open.
// Local page state via useModalPagination avoids colliding with the host
// page's URL keys.

import { StudioPersonDetailDialog } from "@/components/studio/studio-person-detail-dialog";
import type {
  PaginatedResumeLibraryResult,
  ResumeLibraryListRecord,
} from "@arc/shared/studio-resumes";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { actionsColumn, customColumn, DataGrid, dateColumn } from "@/components/data-grid";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Modal } from "@/components/ui/modal";
import { rpcFetch } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { useModalPagination } from "@/lib/client/use-modal-pagination";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

interface ScopedResumesModalProps {
  /** 当前在招岗位 scope；null 时弹窗关闭（也意味着不发请求）。 */
  jobDescription: { id: string; name: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const DEFAULT_PAGE_SIZE = 10;
const QUERY_KEY_PREFIX = "scoped-resumes" as const;

const EMPTY_RESULT: PaginatedResumeLibraryResult = {
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
  records: [],
  total: 0,
  totalPages: 1,
};

export function ScopedResumesModal({
  jobDescription,
  open,
  onOpenChange,
}: ScopedResumesModalProps) {
  const slug = useWorkspaceSlug();
  const navigate = useNavigate();
  const { page, pageSize, setPage, setPageSize } = useModalPagination(DEFAULT_PAGE_SIZE);

  // 当前查看详情的简历记录 id；null 表示详情弹窗关闭。
  // Resume id currently being inspected; null = detail dialog closed.
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);

  const listQuery = useQuery({
    enabled: open && jobDescription !== null,
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<PaginatedResumeLibraryResult> => {
      if (!jobDescription) {
        return EMPTY_RESULT;
      }
      return await rpcFetch<PaginatedResumeLibraryResult>(
        rpc.api.w[":slug"].studio.resumes.$get({
          param: { slug },
          query: {
            jdIds: jobDescription.id,
            page: String(page),
            pageSize: String(pageSize),
            sortBy: "createdAt",
            sortOrder: "desc",
          },
        }),
        "加载简历列表失败",
      );
    },
    queryKey: [QUERY_KEY_PREFIX, slug, jobDescription?.id ?? null, page, pageSize] as const,
    staleTime: 30 * 1000,
  });

  const data = listQuery.data ?? EMPTY_RESULT;

  const columns = useMemo(
    () => [
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => (
          <div className="min-w-0">
            <button
              className="block max-w-full truncate text-left font-medium underline decoration-foreground/20 underline-offset-4 hover:decoration-foreground/60"
              onClick={() => setDetailRecordId(r.id)}
              type="button"
            >
              {r.candidateName || "未命名候选人"}
            </button>
            <p className="truncate text-muted-foreground text-xs">
              {r.candidateEmail || r.candidatePhone || "—"}
            </p>
          </div>
        ),
        key: "candidateName",
        title: "候选人",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) => <span className="text-muted-foreground text-sm">{r.targetRole || "—"}</span>,
        key: "targetRole",
        title: "目标岗位",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) =>
          r.resumeFileName ? (
            <span className="block max-w-xs truncate text-sm">{r.resumeFileName}</span>
          ) : (
            <Badge variant="outline">无文件</Badge>
          ),
        key: "resumeFileName",
        title: "简历文件",
      }),
      customColumn<ResumeLibraryListRecord>({
        cell: (r) =>
          r.hasInterviewRounds ? (
            <Badge variant="secondary">已发起</Badge>
          ) : (
            <Badge variant="outline">未发起</Badge>
          ),
        key: "hasInterviewRounds",
        title: "AI 面试",
      }),
      dateColumn<ResumeLibraryListRecord>({
        key: "createdAt",
        title: "添加时间",
      }),
      actionsColumn<ResumeLibraryListRecord>({
        inline: [
          {
            label: "查看",
            onClick: (r) => setDetailRecordId(r.id),
          },
        ],
      }),
    ],
    [],
  );

  return (
    <>
      <Modal
        bodyClassName="px-6 py-5"
        description="只读视图：列出归属于该在招岗位、未归档的候选人与简历。点击候选人姓名可查看详情。"
        onOpenChange={onOpenChange}
        open={open}
        size="2xl"
        title={jobDescription ? `在招岗位「${jobDescription.name}」的关联简历` : ""}
      >
        <DataGrid<ResumeLibraryListRecord>
          columns={columns}
          data={data.records}
          empty={
            <Empty className="border-border">
              <EmptyHeader>
                <EmptyTitle>暂无关联简历</EmptyTitle>
                <EmptyDescription>
                  {jobDescription
                    ? `当前在招岗位「${jobDescription.name}」下还没有任何候选人。`
                    : ""}
                </EmptyDescription>
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

      {/* 详情弹窗叠在外层弹窗之上；Radix Dialog 原生支持 stacking。
          编辑 / 发起 AI 面试不在本上下文支持，跳转到简历库主页面继续。
          Detail dialog stacks on top of the scoped modal — Radix handles
          this natively. Edit / launch route back to the resume library
          since they need full context (PDF preview, bulk actions, etc.). */}
      <StudioPersonDetailDialog
        mode="resume"
        onEdit={(id) => {
          setDetailRecordId(null);
          void navigate({
            params: { slug },
            search: { recordId: id },
            to: "/w/$slug/studio/resumes",
          });
        }}
        onOpenChange={(next) => {
          if (!next) {
            setDetailRecordId(null);
          }
        }}
        open={detailRecordId !== null}
        recordId={detailRecordId}
      />
    </>
  );
}
