"use client";

import { IconAlertCircle, IconArrowLeft } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";

import { TimeDisplay } from "@/components/features/display/time-display";
import { formatResumeRecordDisplayId } from "@/components/features/resume/resume-record-display-id";
import { scrollToWorkExperienceCompany } from "@/components/features/resume/work-experience";
import { useStudioHeaderOverride } from "@/components/features/studio/studio-header-context";
import { CandidateAvatar } from "@/components/features/studio/candidate-avatar-image";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useHasPermission } from "@/hooks/use-has-permission";
import { fetchResumePoolItem } from "@/lib/client/api";
import { authClient } from "@/lib/client/auth-client";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";

import {
  ResumePoolDetailSummaryPanel,
  ResumePoolQualitativeEvaluationPanel,
  ResumePoolRecommendationsDialog,
  ResumePoolStructuredInfoPanel,
  canManageResumePoolJobBinding,
  useRecordOwnedOpenState,
} from "./resume-pool-details";
import { ResumePoolCareerRail } from "./resume-pool-career-rail";
import { ResumePoolDetailFloatingBar } from "./resume-pool-detail-floating-bar";
import {
  canImportResumePoolToLibrary,
  getCandidateTitle,
  resumeParseStatusBadge,
  resumeRecruitingStatusBadge,
  sessionUserId,
  sourceLabel,
} from "./resume-pool-page-model";

const RESUME_POOL_DETAIL_SKELETON_FIELDS = [
  "target-role",
  "bound-job",
  "source",
  "uploader",
  "work-years",
  "email",
  "phone",
  "created-at",
] as const;

const RESUME_POOL_DETAIL_STRUCTURED_SKELETON_SECTIONS = [
  { bodyClassName: "h-9 w-full max-w-sm", id: "target-roles" },
  { bodyClassName: "h-24 w-full", id: "work" },
  { bodyClassName: "h-20 w-full", id: "education" },
  { bodyClassName: "h-24 w-full", id: "projects" },
  { bodyClassName: "h-9 w-full max-w-xl", id: "skills" },
  { bodyClassName: "h-16 w-full max-w-3xl", id: "strengths" },
] as const;

const RESUME_POOL_DETAIL_QUALITATIVE_SKELETON_COLUMNS = ["matching", "risks"] as const;

const RESUME_POOL_DETAIL_DIMENSION_SKELETON_ROWS = [
  "skill-match",
  "experience-relevance",
  "project-match",
  "education-background",
  "potential",
  "stability",
] as const;

function ResumePoolDetailHeaderOverride({ onBack }: { onBack: () => void }) {
  const header = useMemo(
    () => (
      <Button
        className="-ml-1 h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
        onClick={onBack}
        size="sm"
        type="button"
        variant="ghost"
      >
        <IconArrowLeft data-icon="inline-start" />
        <span className="hidden sm:inline">返回人才库</span>
      </Button>
    ),
    [onBack],
  );
  useStudioHeaderOverride(header);
  return null;
}

export function ResumePoolDetailPageSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="正在加载人才详情"
      className="mx-auto flex w-full max-w-[96rem] flex-col gap-6"
    >
      <header className="flex min-w-0 flex-col gap-4 border-border/70 border-b pb-5">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="size-14 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-7 w-48 max-w-full" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-6 w-14 rounded-sm" />
                <Skeleton className="h-6 w-20 rounded-sm" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-4 w-14" />
                <Skeleton className="h-4 w-24" />
              </div>
            </div>
          </div>
        </div>
      </header>
      <div className="flex flex-col gap-8">
        <div
          className="flex flex-col gap-10"
          data-resume-pool-detail-skeleton="qualitative-evaluation"
        >
          <div className="flex flex-col gap-5">
            <Skeleton className="h-4 w-16" />
            <div className="flex max-w-4xl flex-col gap-4">
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="h-7 w-full max-w-2xl" />
              <Skeleton className="h-4 w-full max-w-3xl" />
              <Skeleton className="h-4 w-4/5 max-w-2xl" />
            </div>
          </div>
          <div className="grid gap-x-12 gap-y-10 border-border/50 border-t pt-8 lg:grid-cols-2">
            {RESUME_POOL_DETAIL_QUALITATIVE_SKELETON_COLUMNS.map((column) => (
              <div className="flex flex-col gap-3" key={column}>
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-1 border-border/50 border-t pt-8">
            <Skeleton className="h-3 w-16" />
            <div className="flex flex-col">
              {RESUME_POOL_DETAIL_DIMENSION_SKELETON_ROWS.map((row) => (
                <div
                  className="flex items-center gap-4 border-border/50 border-b py-4 last:border-b-0"
                  key={row}
                >
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-2 w-24 max-sm:hidden" />
                  <Skeleton className="h-4 flex-1" />
                </div>
              ))}
            </div>
          </div>
        </div>

        <section className="flex flex-col gap-6">
          <dl className="grid gap-x-8 gap-y-4 md:grid-cols-3">
            {RESUME_POOL_DETAIL_SKELETON_FIELDS.map((field) => (
              <div data-resume-pool-detail-skeleton="summary-item" key={field}>
                <Skeleton className="h-3 w-14" />
                <Skeleton className="mt-2 h-5 w-32 max-w-full" />
              </div>
            ))}
          </dl>

          <div className="grid gap-5 border-border/50 border-t pt-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)]">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-16" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-7 w-16 rounded-sm" />
                <Skeleton className="h-7 w-20 rounded-sm" />
                <Skeleton className="h-7 w-24 rounded-sm" />
                <Skeleton className="h-7 w-16 rounded-sm" />
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-6 border-border/50 border-t pt-6">
          <Skeleton className="h-5 w-20" />
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {RESUME_POOL_DETAIL_SKELETON_FIELDS.slice(0, 6).map((field) => (
              <div className="flex flex-col gap-2" key={`basic-${field}`}>
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-5 w-28 max-w-full" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-8">
            {RESUME_POOL_DETAIL_STRUCTURED_SKELETON_SECTIONS.map((section) => (
              <div
                className="flex flex-col gap-3"
                data-resume-pool-detail-skeleton="structured-section"
                key={section.id}
              >
                <Skeleton className="h-4 w-20" />
                <Skeleton className={section.bodyClassName} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

export function ResumePoolDetailPage({
  onBack,
  recordId,
}: {
  onBack: () => void;
  recordId: string;
}) {
  const slug = useWorkspaceSlug();
  const { data: session } = authClient.useSession();
  const currentUserId = sessionUserId(session);
  const canImportResumePool = useHasPermission("resumePool", "import");
  const canReadJobDescriptions = useHasPermission("jd", "read");
  const canCreateResumeLibrary = useHasPermission("resumeLibrary", "create");
  const canRecommend = canImportResumePool && canReadJobDescriptions;
  const [
    recommendationsOpen,
    setRecommendationsOpen,
    recommendationsRecordId,
    handleRecommendationsOpenChangeComplete,
  ] = useRecordOwnedOpenState(recordId);
  const contentRef = useRef<HTMLDivElement>(null);
  const detailQuery = useQuery({
    queryFn: () => fetchResumePoolItem(slug, recordId),
    queryKey: ["resume-pool", "detail", slug, recordId] as const,
    staleTime: 30_000,
  });
  const detail = detailQuery.data ?? null;
  const canManageJobBinding = canManageResumePoolJobBinding({
    canRecommend,
    currentUserId,
    detail,
  });

  useEffect(() => {
    document.title = detail?.candidateName?.trim()
      ? `人才详情·${detail.candidateName}`
      : "人才详情";
  }, [detail?.candidateName]);

  if (detailQuery.isLoading) {
    return <ResumePoolDetailPageSkeleton />;
  }

  if (detailQuery.isError || !detail) {
    return (
      <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
        <ResumePoolDetailHeaderOverride onBack={onBack} />
        <Empty className="border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconAlertCircle />
            </EmptyMedia>
            <EmptyTitle>人才详情加载失败</EmptyTitle>
            <EmptyDescription>该记录可能已被删除，或你暂时没有查看权限。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    );
  }

  const candidateName = getCandidateTitle(detail);

  return (
    <>
      <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-6 pb-[calc(7rem+env(safe-area-inset-bottom))]">
        <ResumePoolDetailHeaderOverride onBack={onBack} />
        <header className="flex min-w-0 flex-col gap-4 border-border/70 border-b pb-5">
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <CandidateAvatar
                className="size-14"
                label={candidateName}
                recordId={detail.id}
                seed={candidateName}
                source="resume-pool"
                version={detail.candidateAvatarVersion}
              />
              <div className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <h1 className="truncate font-semibold text-2xl tracking-normal">
                    {candidateName}
                  </h1>
                  <span className="font-normal text-[14px] text-muted-foreground/60">
                    ({formatResumeRecordDisplayId(detail.id)})
                  </span>
                  {resumeParseStatusBadge(detail)}
                  {resumeRecruitingStatusBadge(detail)}
                </div>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground text-sm">
                  <span>{detail.resumeFileName || "未提供简历文件名"}</span>
                  <span aria-hidden>·</span>
                  <span>{sourceLabel(detail)}</span>
                  <span aria-hidden>·</span>
                  <TimeDisplay as="span" value={detail.createdAt} />
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-start xl:gap-x-10 2xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="flex min-w-0 flex-col gap-8" ref={contentRef}>
            <ResumePoolQualitativeEvaluationPanel
              detail={detail}
              onRequestRecommendations={
                canManageJobBinding ? () => setRecommendationsOpen(true) : undefined
              }
              slug={slug}
            />
            <ResumePoolDetailSummaryPanel
              detail={detail}
              isError={false}
              isLoading={false}
              onRequestRecommendations={
                canManageJobBinding ? () => setRecommendationsOpen(true) : undefined
              }
              resumeProfile={detail.resumeProfile}
              showCandidateSummary={false}
              slug={slug}
            />
            <ResumePoolStructuredInfoPanel
              detail={detail}
              isLoading={false}
              resumeProfile={detail.resumeProfile}
            />
          </div>
          <aside className="hidden min-w-0 max-w-full overflow-hidden xl:sticky xl:top-[calc(var(--header-height)+1rem)] xl:block xl:self-start">
            <ResumePoolCareerRail
              onWorkExperienceSelect={(companyName) => {
                scrollToWorkExperienceCompany(contentRef.current, companyName);
              }}
              profile={detail.resumeProfile}
            />
          </aside>
        </div>
      </main>

      <ResumePoolDetailFloatingBar
        canEnterRecruiting={canImportResumePoolToLibrary(
          canImportResumePool,
          canCreateResumeLibrary,
        )}
        detail={detail}
        key={detail.id}
        slug={slug}
      />
      <ResumePoolRecommendationsDialog
        canRecommend={canRecommend}
        currentUserId={currentUserId}
        onOpenChange={setRecommendationsOpen}
        onOpenChangeComplete={handleRecommendationsOpenChangeComplete}
        open={canManageJobBinding && recommendationsOpen}
        record={recommendationsRecordId === recordId ? detail : null}
        recordId={recommendationsRecordId}
        slug={slug}
      />
    </>
  );
}
