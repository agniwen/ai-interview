import { IconFileText, IconPlus } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter, useSearch } from "@tanstack/react-router";
import type { DepartmentListRecord } from "@app/shared/departments";
import type { InterviewerListRecord } from "@app/shared/interviewers";
import { DepartmentRail } from "@/components/features/studio/departments/department-rail";
import { PageHeader } from "@/components/features/studio/page-header";
import { EntityDeleteDialog } from "@/components/features/studio/entity-delete-dialog";
import { useEntityCrud } from "@/components/features/studio/use-entity-crud";
import type { JobDescriptionListRecord, JobDescriptionRecord } from "@app/shared/job-descriptions";
import type { JobRecruitingStatus } from "@app/db-schema/job-recruiting-status";
import { ScopedResumesModal } from "@/components/features/studio/scoped-resumes-modal";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  actionsColumn,
  customColumn,
  DataGrid,
  dateColumn,
  estimateActionsColumnSize,
  textColumn,
} from "@/components/features/data-grid";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { rpc } from "@/lib/client/rpc";
import { createJobDescriptionReferralLink, rpcFetch } from "@/lib/client/api";
import { runAsyncAction } from "@/lib/client/async-control";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useJobDescriptionList } from "@/components/features/studio/job-descriptions/use-job-description-list";
import { JobDescriptionTalentRecommendationsDialog } from "@/components/features/studio/job-descriptions/job-description-talent-recommendations-dialog";
import { copyTextToClipboard } from "@/lib/client/clipboard";
import { useHasPermission } from "@/hooks/use-has-permission";
import { toast } from "sonner";
import { z } from "zod";

function getPriorityBadgeVariant(priority: "high" | "medium" | "low") {
  if (priority === "high") {
    return "destructive" as const;
  }
  if (priority === "medium") {
    return "warning" as const;
  }
  return "secondary" as const;
}

interface RecruitingStatusChange {
  record: JobDescriptionListRecord;
  targetStatus: JobRecruitingStatus;
}

function recruitingStatusSuccessMessage(status: JobRecruitingStatus): string {
  if (status === "active") {
    return "岗位已恢复招聘";
  }
  if (status === "paused") {
    return "岗位已暂停招聘";
  }
  return "岗位已停止招聘";
}

function recruitingStatusChangeDescription(change: RecruitingStatusChange | null): string {
  if (!change) {
    return "";
  }
  if (change.targetStatus === "stopped") {
    if (change.record.resumeCount > 0) {
      return `岗位「${change.record.name}」仍有 ${change.record.resumeCount} 位候选人处于招聘流程中。请先将所有候选人处理为终止态，再停止招聘。`;
    }
    return `停止后岗位「${change.record.name}」将不能再恢复，也不能新增候选人。`;
  }
  return `暂停后岗位「${change.record.name}」不能新增候选人；已发起的候选人流程不受影响，可继续推进。`;
}

function recruitingStatusConfirmLabel(
  change: RecruitingStatusChange | null,
  updating: boolean,
): string {
  if (updating) {
    return "处理中…";
  }
  return change?.targetStatus === "stopped" ? "确认停止" : "确认暂停";
}

export function JobDescriptionManagementPage({
  departments,
  interviewers,
}: {
  departments: DepartmentListRecord[];
  interviewers: InterviewerListRecord[];
}) {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const queryClient = useQueryClient();
  // 当前点开"简历关联"的那条 JD；null 表示弹窗关闭。
  // The JD whose associated resumes are being inspected; null = closed.
  const [resumesScope, setResumesScope] = useState<{ id: string; name: string } | null>(null);
  const [recommendationScope, setRecommendationScope] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [copyingReferralIds, setCopyingReferralIds] = useState<Set<string>>(() => new Set());
  const [statusChange, setStatusChange] = useState<RecruitingStatusChange | null>(null);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const canCreateJobDescription = useHasPermission("jd", "create");
  const canUpdateJobDescription = useHasPermission("jd", "update");
  const canDeleteJobDescription = useHasPermission("jd", "delete");
  const canReadResumeLibrary = useHasPermission("resumeLibrary", "read");

  const { grid, listGridProps } = useJobDescriptionList(slug);

  const loadJobDescriptionDetail = useCallback(
    async (record: JobDescriptionListRecord): Promise<JobDescriptionRecord | null> => {
      const response = await rpc.api.w[":slug"].studio["job-descriptions"][":id"].$get({
        param: { id: record.id, slug },
      });
      if (!response.ok) {
        return null;
      }
      return await response.json();
    },
    [slug],
  );

  // 部门可在岗位表单内新建，只有缺少面试官时才无法创建岗位。
  // Departments can be created inside the job form; only missing interviewers block creation.
  const missingRefs = interviewers.length === 0;
  const selectedDepartmentId = grid.filters.departmentId;
  const { setFilter } = grid;

  // 选中的部门被删除（或 URL 里是旧的多选值）时回到「全部岗位」。
  // Fall back to "all jobs" when the selected department no longer exists or the URL holds a stale value.
  useEffect(() => {
    if (selectedDepartmentId && !departments.some((item) => item.id === selectedDepartmentId)) {
      setFilter("departmentId", "");
    }
  }, [departments, selectedDepartmentId, setFilter]);

  function invalidateJobDescriptionData() {
    grid.invalidate();
    void queryClient.invalidateQueries({ queryKey: ["job-descriptions"] });
    void queryClient.invalidateQueries({ queryKey: ["interviewers"] });
    void router.invalidate();
  }

  const crud = useEntityCrud<JobDescriptionListRecord, JobDescriptionRecord>({
    deleteEntity: (record) =>
      rpc.api.w[":slug"].studio["job-descriptions"][":id"].$delete({
        param: { id: record.id, slug },
      }),
    invalidate: invalidateJobDescriptionData,
    loadDetail: loadJobDescriptionDetail,
    messages: {
      deleteSuccess: "在招岗位已删除",
      loadDetailError: "加载在招岗位失败",
    },
  });

  const deepLinkSearch = useSearch({ from: "/w/$slug/studio/job-descriptions" });
  const navigate = useNavigate({ from: "/w/$slug/studio/job-descriptions" });
  const openEditorPage = useCallback(
    (id: string) => {
      void navigate({
        params: { jobId: id, slug },
        resetScroll: false,
        search: deepLinkSearch,
        to: "/w/$slug/studio/job-descriptions/overlay/$jobId",
      });
    },
    [navigate, slug, deepLinkSearch],
  );
  useEffect(() => {
    const targetId = z.string().safeParse(deepLinkSearch.jobDescriptionId);
    if (!targetId.success || !targetId.data) {
      return;
    }
    const { jobDescriptionId: _legacyId, ...search } = deepLinkSearch;
    void navigate({
      params: { jobId: targetId.data, slug },
      replace: true,
      search,
      to: "/w/$slug/studio/job-descriptions/$jobId",
    });
  }, [deepLinkSearch, navigate, slug]);

  async function copyReferralLink(record: JobDescriptionListRecord) {
    setCopyingReferralIds((current) => new Set(current).add(record.id));
    await runAsyncAction({
      cleanup: () =>
        setCopyingReferralIds((current) => {
          const next = new Set(current);
          next.delete(record.id);
          return next;
        }),
      onError: (error) => toast.error(error instanceof Error ? error.message : "创建内推链接失败"),
      operation: async () => {
        const result = await createJobDescriptionReferralLink(slug, record.id);
        const copyResult = await copyTextToClipboard(result.url);
        if (copyResult === "failed") {
          toast.error("复制失败，请手动复制链接");
          return;
        }
        toast.success(copyResult === "manual" ? "请在弹窗中手动复制内推链接" : "内推链接已复制");
      },
    });
  }

  async function updateRecruitingStatus(
    record: JobDescriptionListRecord,
    targetStatus: JobRecruitingStatus,
  ) {
    setStatusUpdating(true);
    const result = await runAsyncAction({
      cleanup: () => setStatusUpdating(false),
      onError: (error) => toast.error(error instanceof Error ? error.message : "更新岗位状态失败"),
      operation: () =>
        rpcFetch(
          rpc.api.w[":slug"].studio["job-descriptions"][":id"]["recruiting-status"].$patch({
            json: { status: targetStatus },
            param: { id: record.id, slug },
          }),
          "更新岗位状态失败",
        ),
    });
    if (!result.ok) {
      return;
    }
    setStatusChange(null);
    toast.success(recruitingStatusSuccessMessage(targetStatus));
    invalidateJobDescriptionData();
  }

  const columns = useMemo(
    () => [
      textColumn<JobDescriptionListRecord>({
        key: "name",
        primary: true,
        size: 220,
        title: "岗位名称",
        truncate: "max-w-full",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (record) => {
          if (record.lifecycleStatus === "draft") {
            return <Badge variant="warning">迁移待处理</Badge>;
          }
          const meta = {
            active: { label: "招聘中", variant: "success" },
            paused: { label: "已暂停", variant: "warning" },
            stopped: { label: "已停止", variant: "secondary" },
          } as const;
          const status = meta[record.recruitingStatus];
          return <Badge variant={status.variant}>{status.label}</Badge>;
        },
        key: "recruitingStatus",
        size: 100,
        title: "状态",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) =>
          r.code ? (
            <span className="whitespace-nowrap font-mono text-xs">{r.code}</span>
          ) : (
            <span className="whitespace-nowrap text-muted-foreground text-sm">未生成</span>
          ),
        key: "code",
        size: 110,
        title: "编码",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) =>
          r.departmentName ? (
            <span className="block truncate" title={r.departmentName}>
              {r.departmentName}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">未知</span>
          ),
        key: "departmentName",
        size: 120,
        title: "部门",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => {
          if (r.interviewers.length === 0) {
            return <span className="whitespace-nowrap text-muted-foreground text-xs">未配置</span>;
          }
          const names = r.interviewers.map((item) => item.name).join("、");
          return (
            <span className="block truncate text-sm" title={names}>
              {names}
            </span>
          );
        },
        key: "interviewers",
        size: 200,
        title: "面试官",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) =>
          r.reportingManagerName ? (
            <span className="block truncate" title={r.reportingManagerName}>
              {r.reportingManagerName}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
        key: "reportingManagerName",
        size: 110,
        title: "汇报上级",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) =>
          r.salaryMinK || r.salaryMaxK ? (
            <span className="whitespace-nowrap text-sm tabular-nums">
              {r.salaryMinK ?? "—"}–{r.salaryMaxK ?? "—"}K
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
        key: "salaryRange",
        size: 130,
        title: "薪资区间",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => r.headcount ?? <span className="text-muted-foreground text-xs">—</span>,
        key: "headcount",
        size: 96,
        title: "需求人数",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) =>
          r.jobWeight ? (
            <span className="font-mono text-sm tabular-nums">{r.jobWeight}</span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
        key: "jobWeight",
        size: 96,
        title: "岗位权重",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => {
          const labels = { high: "高", low: "低", medium: "中" };
          return r.priority ? (
            <Badge variant={getPriorityBadgeVariant(r.priority)}>{labels[r.priority]}</Badge>
          ) : (
            <span className="whitespace-nowrap text-muted-foreground text-xs">未设置</span>
          );
        },
        key: "priority",
        size: 90,
        title: "优先级",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) =>
          r.referralChannels ? (
            <span className="block truncate" title={r.referralChannels}>
              {r.referralChannels}
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">—</span>
          ),
        key: "referralChannels",
        size: 150,
        title: "简历推荐渠道",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => {
          if (r.resumeCount === 0) {
            return (
              <span className="whitespace-nowrap text-muted-foreground text-sm">
                关联了 0 个简历
              </span>
            );
          }
          if (!canReadResumeLibrary) {
            return (
              <span className="whitespace-nowrap text-muted-foreground text-sm">
                关联了 {r.resumeCount} 个简历
              </span>
            );
          }
          return (
            <Button
              className="h-auto p-0 font-medium"
              onClick={() => setResumesScope({ id: r.id, name: r.name })}
              type="button"
              variant="link"
            >
              关联了 {r.resumeCount} 个简历
            </Button>
          );
        },
        key: "resumeCount",
        size: 150,
        title: "简历关联",
      }),
      customColumn<JobDescriptionListRecord>({
        cell: (r) => (
          <span className="block truncate text-muted-foreground text-sm" title={r.prompt}>
            {r.prompt || "—"}
          </span>
        ),
        key: "description",
        size: 260,
        title: "岗位 JD",
      }),
      dateColumn<JobDescriptionListRecord>({
        key: "createdAt",
        title: "创建时间",
      }),
      actionsColumn<JobDescriptionListRecord>({
        inline: [
          {
            label: "编辑",
            onClick: (r) => {
              openEditorPage(r.id);
            },
            show: () => canUpdateJobDescription,
          },
        ],
        menu: [
          {
            disabled: (r) => r.recruitingStatus !== "active",
            disabledReason: (r) =>
              r.recruitingStatus === "paused"
                ? "岗位已暂停，不能新增候选人"
                : "岗位已停止，不能新增候选人",
            label: "推荐",
            onClick: (r) => {
              setRecommendationScope({ id: r.id, name: r.name });
            },
            show: () => canReadResumeLibrary,
          },
          {
            disabled: (r) => copyingReferralIds.has(r.id) || r.recruitingStatus !== "active",
            disabledReason: (r) => {
              if (copyingReferralIds.has(r.id)) {
                return "正在创建内推链接";
              }
              return r.recruitingStatus === "paused"
                ? "岗位已暂停，不能新增候选人"
                : "岗位已停止，不能新增候选人";
            },
            label: "复制内推链接",
            onClick: copyReferralLink,
          },
          {
            label: "恢复招聘",
            onClick: (r) => {
              void updateRecruitingStatus(r, "active");
            },
            show: (r) =>
              canUpdateJobDescription &&
              r.lifecycleStatus === "published" &&
              r.recruitingStatus === "paused",
          },
          {
            label: "暂停招聘",
            onClick: (r) => setStatusChange({ record: r, targetStatus: "paused" }),
            separator: "before",
            show: (r) =>
              canUpdateJobDescription &&
              r.lifecycleStatus === "published" &&
              r.recruitingStatus === "active",
          },
          {
            label: "停止招聘",
            onClick: (r) => setStatusChange({ record: r, targetStatus: "stopped" }),
            separator: "before",
            show: (r) =>
              canUpdateJobDescription &&
              r.lifecycleStatus === "published" &&
              r.recruitingStatus !== "stopped",
            variant: "destructive",
          },
          {
            label: "删除",
            onClick: (r) => crud.setDeleteRecord(r),
            separator: "before",
            show: () => canDeleteJobDescription,
            variant: "destructive",
          },
        ],
        size: estimateActionsColumnSize({
          hasMenu: true,
          inlineLabels: ["编辑"],
        }),
      }),
    ],
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [
      canDeleteJobDescription,
      canReadResumeLibrary,
      canUpdateJobDescription,
      copyingReferralIds,
      openEditorPage,
    ],
  );

  const filtersConfig = useMemo(
    () => [
      { key: "textFilters" as const, resource: "jobs" as const, type: "text-filters" as const },
      {
        emptyMessage: "没有匹配的面试官",
        key: "interviewerId" as const,
        options: interviewers.map((i) => ({
          description: i.departmentName ?? "未知部门",
          label: i.name,
          value: i.id,
        })),
        placeholder: "全部面试官",
        searchPlaceholder: "搜索面试官…",
        selectedFormat: (count: number) => `已选 ${count} 位面试官`,
        type: "multi-select" as const,
      },
    ],
    [interviewers],
  );

  return (
    <>
      <div className="mx-auto w-full max-w-[96rem] space-y-6">
        <PageHeader title="岗位" />

        <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          <DepartmentRail
            departments={departments}
            onChanged={invalidateJobDescriptionData}
            onSelect={(departmentId) => setFilter("departmentId", departmentId)}
            selectedDepartmentId={selectedDepartmentId}
          />

          <DataGrid<JobDescriptionListRecord>
            {...grid.bind}
            {...listGridProps}
            columnPinning={{ end: ["actions"], start: ["name"] }}
            columns={columns}
            empty={
              missingRefs ? (
                <Empty className="border-border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconFileText className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>请先创建面试官</EmptyTitle>
                    <EmptyDescription>
                      在招岗位需要指定面试官，先去「面试官 Agent」完成配置。
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Empty className="border-border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <IconFileText className="size-5" />
                    </EmptyMedia>
                    <EmptyTitle>还没有在招岗位</EmptyTitle>
                  </EmptyHeader>
                  {canCreateJobDescription ? (
                    <EmptyContent className="flex items-center justify-center">
                      <Button
                        disabled={missingRefs}
                        onClick={() => {
                          queryClient.setQueryData(
                            ["job-description-create-department", slug],
                            selectedDepartmentId ?? "",
                          );
                          openEditorPage("new");
                        }}
                      >
                        <IconPlus className="size-4" />
                        创建在招岗位
                      </Button>
                    </EmptyContent>
                  ) : null}
                </Empty>
              )
            }
            filters={filtersConfig}
            getRowId={(r) => r.id}
            toolbarRight={
              canCreateJobDescription ? (
                <Button
                  className="flex-1 sm:flex-none"
                  disabled={missingRefs}
                  onClick={() => {
                    queryClient.setQueryData(
                      ["job-description-create-department", slug],
                      selectedDepartmentId ?? "",
                    );
                    openEditorPage("new");
                  }}
                >
                  <IconPlus className="size-4" />
                  创建在招岗位
                </Button>
              ) : null
            }
          />
        </div>
      </div>

      <EntityDeleteDialog
        confirmDisabled={(record) => record.resumeCount > 0}
        description={(record) => {
          if (record.resumeCount > 0) {
            return `当前有 ${record.resumeCount} 条简历关联到岗位「${record.name}」，无法删除；请先到招聘台取消关联或删除这些候选人。`;
          }
          return `即将删除岗位：${record.name}，引用该岗位的面试记录的关联岗位字段会被清空。`;
        }}
        onClose={() => crud.setDeleteRecord(null)}
        onConfirm={crud.handleDelete}
        record={canDeleteJobDescription ? crud.deleteRecord : null}
        title="确认删除这个在招岗位？"
      />

      <AlertDialog
        onOpenChange={(open) => {
          if (!open && !statusUpdating) {
            setStatusChange(null);
          }
        }}
        open={statusChange !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusChange?.targetStatus === "stopped" ? "停止招聘？" : "暂停招聘？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {recruitingStatusChangeDescription(statusChange)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusUpdating}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                statusUpdating ||
                (statusChange?.targetStatus === "stopped" &&
                  (statusChange?.record.resumeCount ?? 0) > 0)
              }
              onClick={() => {
                if (statusChange) {
                  void updateRecruitingStatus(statusChange.record, statusChange.targetStatus);
                }
              }}
              variant={statusChange?.targetStatus === "stopped" ? "destructive" : "default"}
            >
              {recruitingStatusConfirmLabel(statusChange, statusUpdating)}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ScopedResumesModal
        jobDescription={resumesScope}
        onOpenChange={(next) => {
          if (!next) {
            setResumesScope(null);
          }
        }}
        open={canReadResumeLibrary && resumesScope !== null}
      />

      <JobDescriptionTalentRecommendationsDialog
        jobDescription={recommendationScope}
        onOpenChange={(next) => {
          if (!next) {
            setRecommendationScope(null);
          }
        }}
        open={canReadResumeLibrary && recommendationScope !== null}
      />
    </>
  );
}
