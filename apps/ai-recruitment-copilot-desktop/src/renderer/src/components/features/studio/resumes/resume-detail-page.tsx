import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState } from "react";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { useMeetingRecordingActions } from "@/components/features/meeting/meeting-recording-context";
import { ResumeOverviewPanel } from "@/components/features/studio/resumes/resume-overview-panel";
import { ResumeReviewStructuredView } from "@/components/features/studio/resumes/resume-review-structured-view";
import { ResumeScreeningResultPanel } from "@/components/features/studio/resumes/resume-screening-result-panel";
import { StructuredResumeEvaluationPanel } from "@/components/features/studio/resumes/structured-resume-evaluation-panel";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchStudioResume } from "@/lib/client/studio-resumes";
import { desktopWorkspaceKeys, resolveActiveWorkspace } from "@/lib/client/workspace";

type DetailTab = "overview" | "ai-analysis";

function ResumeDetailSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 px-4 py-4 sm:px-6">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex min-w-0 flex-col gap-4 border-border/70 border-b pb-4">
          <div className="min-w-0">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="mt-2 h-4 w-64 max-w-full" />
          </div>
          <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex h-10 w-full items-center gap-1 rounded-md bg-muted p-1 sm:w-auto">
              <Skeleton className="h-8 flex-1 sm:w-16 sm:flex-none" />
              <Skeleton className="h-8 flex-1 sm:w-20 sm:flex-none" />
            </div>
            <Skeleton className="h-9 w-full sm:w-36" />
          </div>
        </header>
        <div className="min-w-0 flex flex-col gap-8">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-14" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
              <div className="flex min-h-48 items-center justify-center">
                <Skeleton className="size-44 rounded-lg" />
              </div>
              <div className="min-w-0 space-y-3">
                <Skeleton className="h-10 w-20" />
                <Skeleton className="h-5 w-3/4 max-w-md" />
                <Skeleton className="h-16 w-full max-w-lg" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function DetailHeaderText({ detail }: { detail: ResumeLibraryDetail }) {
  const jobName = detail.jobDescriptionName?.trim() || "暂未关联岗位";
  const title = detail.candidateName?.trim() || "候选人详情";

  return (
    <>
      <h1 className="font-semibold text-2xl tracking-normal">
        <span className="wrap-break-word">{title}</span>
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">{jobName}</p>
    </>
  );
}

export function ResumeDetailPage() {
  const { recordId } = useParams({ from: "/_app/resumes/$recordId" });
  const { openMeetingRecording } = useMeetingRecordingActions();
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");

  const workspaceQuery = useQuery({
    queryFn: resolveActiveWorkspace,
    queryKey: desktopWorkspaceKeys.active,
    staleTime: 60_000,
  });
  const slug = workspaceQuery.data?.slug ?? null;

  const detailQuery = useQuery({
    enabled: Boolean(slug && recordId),
    queryFn: () => {
      if (!slug) {
        throw new Error("当前工作区不可用");
      }
      return fetchStudioResume(slug, recordId);
    },
    queryKey: ["studio-resumes", slug, "detail", recordId],
    staleTime: 30_000,
  });

  if (workspaceQuery.isPending || (Boolean(slug) && detailQuery.isPending)) {
    return <ResumeDetailSkeleton />;
  }

  if (workspaceQuery.error || !slug) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-medium text-sm">无法加载工作区</p>
        <p className="mt-1 text-muted-foreground text-xs">
          {workspaceQuery.error instanceof Error
            ? workspaceQuery.error.message
            : "请先在网页端加入或创建工作区"}
        </p>
        <Button
          className="mt-4"
          nativeButton={false}
          render={<Link to="/recruitment" />}
          type="button"
          variant="outline"
        >
          返回招聘台
        </Button>
      </div>
    );
  }

  if (detailQuery.error) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">
          {detailQuery.error instanceof Error ? detailQuery.error.message : "加载详情失败"}
        </p>
        <Button
          onClick={() => {
            void detailQuery.refetch();
          }}
          type="button"
          variant="outline"
        >
          重试
        </Button>
      </div>
    );
  }

  const detail = detailQuery.data;
  if (!detail) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-medium text-sm">未找到招聘记录</p>
        <p className="mt-1 text-muted-foreground text-xs">记录可能已删除，或你没有查看权限</p>
        <Button
          className="mt-4"
          nativeButton={false}
          render={<Link to="/recruitment" />}
          type="button"
          variant="outline"
        >
          返回招聘台
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 px-4 py-4 sm:px-6">
      <Tabs
        onValueChange={(value) => {
          if (value === "overview" || value === "ai-analysis") {
            setActiveTab(value);
          }
        }}
        value={activeTab}
      >
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex min-w-0 flex-col gap-4 border-border/70 border-b pb-4">
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <DetailHeaderText detail={detail} />
              </div>
            </div>

            <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <TabsList className="mt-0 w-full sm:w-auto">
                <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="overview">
                  概览
                </TabsTrigger>
                <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="ai-analysis">
                  AI评分
                </TabsTrigger>
              </TabsList>
              <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                <Button
                  className="w-full sm:w-auto"
                  onClick={() =>
                    openMeetingRecording({ resumeRecord: detail, resumeRecordId: detail.id })
                  }
                  size="sm"
                  type="button"
                >
                  <Icon className="size-4" icon="ph:record" />
                  新建录制
                </Button>
              </div>
            </div>
          </header>

          {/* No activity timeline rail — overview content only (matches web without aside). */}
          <div className="flex min-w-0 flex-col gap-8">
            <TabsContent value="overview">
              <div className="space-y-8">
                <ResumeOverviewPanel
                  canEdit={false}
                  detail={detail}
                  onViewAiScore={() => setActiveTab("ai-analysis")}
                  slug={slug}
                />
              </div>
            </TabsContent>

            <TabsContent value="ai-analysis">
              <div className="space-y-6">
                {detail.resumeEvaluationArtifactMode === "structured" ? (
                  <StructuredResumeEvaluationPanel
                    canEdit={false}
                    detail={detail}
                    onUpdated={() => {
                      void detailQuery.refetch();
                    }}
                    slug={slug}
                  />
                ) : (
                  <ResumeReviewStructuredView
                    review={detail.resumeReview}
                    screeningResultSlot={<ResumeScreeningResultPanel resumeRecord={detail} />}
                  />
                )}
              </div>
            </TabsContent>
          </div>
        </div>
      </Tabs>
    </main>
  );
}
