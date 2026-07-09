import { IconArrowLeft } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  useNavigate,
  useParams,
  useRouter,
  useSearch,
} from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  canLaunchInterviewFromResume,
  getResumeActionLockedReason,
} from "@arc/shared/studio-resumes";

import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { StudioPersonDetailPanel } from "@/components/features/studio/studio-person-detail-panel";
import type { StudioPersonDetailTab } from "@/components/features/studio/studio-person-detail-panel";
import { StudioPersonEditDialog } from "@/components/features/studio/studio-person-edit-dialog";
import { StudioResumeFloatingChat } from "@/components/features/studio/studio-resume-floating-chat";
import { CandidateTimelineSkeleton } from "@/components/features/studio/candidate-timeline";
import { useStudioHeaderOverride } from "@/components/features/studio/studio-header-context";
import { LaunchInterviewDialog } from "@/components/features/studio/resumes/launch-interview-dialog";
import { TransitionCandidateDialog } from "@/components/features/studio/resumes/transition-candidate-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchStudioResume } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { useHasPermission } from "@/hooks/use-has-permission";
import { requireStudioPageAccess } from "@/lib/start/studio/page-access";

type ResumeDetailPageSearchValue = boolean | number | string;
type ResumeDetailPageSearch = Record<
  string,
  ResumeDetailPageSearchValue | ResumeDetailPageSearchValue[] | undefined
>;

const RESUME_DETAIL_TABS = new Set<StudioPersonDetailTab>([
  "overview",
  "rounds",
  "human-interview",
  "offer",
]);

function firstSearchValue(value: ResumeDetailPageSearch[string]) {
  return Array.isArray(value) ? value[0] : value;
}

function coerceSearchParams(search: Record<string, unknown>): ResumeDetailPageSearch {
  const out: ResumeDetailPageSearch = {};
  for (const [key, value] of Object.entries(search)) {
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      out[key] = value.filter(
        (item): item is ResumeDetailPageSearchValue =>
          typeof item === "string" || typeof item === "number" || typeof item === "boolean",
      );
    }
  }
  return out;
}

function resolveDefaultTab(search: ResumeDetailPageSearch): StudioPersonDetailTab {
  const tab = firstSearchValue(search.tab);
  return typeof tab === "string" && RESUME_DETAIL_TABS.has(tab as StudioPersonDetailTab)
    ? (tab as StudioPersonDetailTab)
    : "overview";
}

function listSearchFromDetailSearch(search: ResumeDetailPageSearch): ResumeDetailPageSearch {
  const next = { ...search };
  delete next.tab;
  return next;
}

function getRecruiterResumeDocumentTitle(candidateName: string | null | undefined) {
  const name = candidateName?.trim();
  return name ? `候选人详情·${name}` : "候选人详情";
}

function RecruiterResumeDetailSkeleton() {
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
      <div className="flex min-w-0 flex-col gap-5">
        <header className="flex min-w-0 flex-col gap-4 border-border/70 border-b pb-4">
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <Skeleton className="mb-3 h-8 w-28" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="mt-2 h-4 w-64 max-w-full" />
            </div>
          </div>
          <div className="mt-2 flex flex-col items-stretch gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
            <div className="flex h-10 w-full items-center gap-1 rounded-md bg-muted p-1 sm:w-auto">
              <Skeleton className="h-8 flex-1 sm:w-16 sm:flex-none" />
              <Skeleton className="h-8 flex-1 sm:w-20 sm:flex-none" />
              <Skeleton className="hidden h-8 w-20 sm:block" />
              <Skeleton className="hidden h-8 w-16 sm:block" />
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
              <Skeleton className="h-9 w-full sm:w-64" />
              <Skeleton className="h-9 w-full sm:w-24" />
            </div>
          </div>
        </header>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="min-w-0 flex flex-col gap-8">
            <section className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-6 w-16 rounded-full" />
                </div>
                <Skeleton className="h-7 w-20" />
              </div>
              <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.8fr)_minmax(0,1.2fr)] lg:items-center">
                <div className="flex min-h-48 items-center justify-center">
                  <Skeleton className="size-44 rounded-lg" />
                </div>
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-10 w-20" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-5 w-3/5" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-11/12" />
                    <Skeleton className="h-4 w-2/3" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
            </section>

            <section className="space-y-6 border-border/50 border-t pt-6">
              <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, index) => (
                  <div className="min-w-0" key={index}>
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="mt-2 h-5 w-44 max-w-full" />
                  </div>
                ))}
              </dl>
            </section>

            <section className="space-y-4 border-border/50 border-t pt-6">
              <Skeleton className="h-5 w-20" />
              <div className="grid gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div className="rounded-xl border border-muted/60 bg-muted/20 p-4" key={index}>
                    <Skeleton className="h-4 w-24" />
                    <div className="mt-4 space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-10/12" />
                      <Skeleton className="h-4 w-7/12" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
          <aside className="hidden min-w-0 max-w-full overflow-hidden xl:block">
            <CandidateTimelineSkeleton />
          </aside>
        </div>
      </div>
    </main>
  );
}

function RecruiterResumeDetailHeaderOverride({ onBack }: { onBack: () => void }) {
  const header = useMemo(
    () => (
      <div className="flex min-w-0 items-center gap-2">
        <Button
          className="-ml-1 h-8 shrink-0 px-2 text-muted-foreground hover:text-foreground"
          onClick={onBack}
          size="sm"
          type="button"
          variant="ghost"
        >
          <IconArrowLeft className="size-4" />
          <span className="hidden sm:inline">返回招聘台</span>
        </Button>
      </div>
    ),
    [onBack],
  );

  useStudioHeaderOverride(header);
  return null;
}

function RecruiterResumeDetailHeaderText({
  description,
  title,
}: {
  description: ReactNode;
  title: ReactNode;
}) {
  return (
    <>
      <h1 className="font-semibold text-2xl tracking-normal">{title}</h1>
      {description ? <p className="mt-2 text-muted-foreground text-sm">{description}</p> : null}
    </>
  );
}

function RecruiterResumeDetailPage() {
  const slug = useWorkspaceSlug();
  const router = useRouter();
  const navigate = useNavigate({ from: "/w/$slug/studio/resumes/$recordId" });
  const routeSearch = useSearch({ from: "/w/$slug/studio/resumes/$recordId" });
  const { recordId } = useParams({ from: "/w/$slug/studio/resumes/$recordId" });
  const queryClient = useQueryClient();
  const canCreateInterview = useHasPermission("interview", "create");
  const canUpdateResumeLibrary = useHasPermission("resumeLibrary", "update");
  const [editRecordId, setEditRecordId] = useState<string | null>(null);
  const [launchingRecord, setLaunchingRecord] = useState<{
    id: string;
    candidateName: string | null;
  } | null>(null);
  const [transitionTarget, setTransitionTarget] = useState<{
    candidate: { id: string; candidateName: string | null };
    mode: "close" | "reactivate";
    initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
  } | null>(null);
  const [interviewRoundDetailId, setInterviewRoundDetailId] = useState<string | null>(null);
  const [interviewDetailDialogOpen, setInterviewDetailDialogOpen] = useState(false);
  const [interviewDetailDefaultTab, setInterviewDetailDefaultTab] = useState<
    "overview" | "reports"
  >("overview");
  const detailQuery = useQuery({
    queryFn: () => fetchStudioResume(slug, recordId),
    queryKey: ["studio-resumes", slug, "detail", recordId, "authed"] as const,
    staleTime: 30_000,
  });
  const detail = detailQuery.data ?? null;
  const defaultTab = resolveDefaultTab(routeSearch);
  const documentTitle = getRecruiterResumeDocumentTitle(detail?.candidateName);

  useEffect(() => {
    document.title = documentTitle;
  }, [documentTitle]);

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds"] });
    void queryClient.invalidateQueries({ queryKey: ["studio-interviews"] });
    void router.invalidate();
  };

  const navigateBackToList = useCallback(() => {
    const locationState = router.state.location.state as { fromRecruiterResumeList?: boolean };
    if (locationState.fromRecruiterResumeList && router.history.canGoBack()) {
      router.history.back();
      return;
    }
    void navigate({
      params: { slug },
      search: listSearchFromDetailSearch(routeSearch),
      to: "/w/$slug/studio/resumes",
    } as never);
  }, [navigate, routeSearch, router, slug]);

  if (detailQuery.isLoading) {
    return <RecruiterResumeDetailSkeleton />;
  }

  return (
    <>
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <StudioPersonDetailPanel
          accessMode="authed"
          defaultTab={defaultTab}
          layoutMode="page"
          mode="resume"
          onEdit={
            canUpdateResumeLibrary
              ? (id) => {
                  const reason = detail
                    ? getResumeActionLockedReason(detail.resumeParseStatus)
                    : null;
                  if (reason) {
                    toast.error(reason);
                    return;
                  }
                  setEditRecordId(id);
                }
              : undefined
          }
          onLaunchInterview={
            canCreateInterview
              ? ({ id, candidateName }) => {
                  if (detail && !canLaunchInterviewFromResume(detail.resumeParseStatus)) {
                    toast.error("简历解析完成后才能发起 AI 面试");
                    return;
                  }
                  if (detail && !detail.jobDescriptionId) {
                    toast.error("请先绑定在招岗位后再发起 AI 面试");
                    return;
                  }
                  setLaunchingRecord({ candidateName, id });
                }
              : undefined
          }
          onRequestClose={
            canUpdateResumeLibrary
              ? ({ id, candidateName, initialOutcome }) => {
                  const reason = detail
                    ? getResumeActionLockedReason(detail.resumeParseStatus)
                    : null;
                  if (reason) {
                    toast.error(reason);
                    return;
                  }
                  setTransitionTarget({
                    candidate: { candidateName, id },
                    initialOutcome,
                    mode: "close",
                  });
                }
              : undefined
          }
          onRequestReactivate={
            canUpdateResumeLibrary
              ? (candidate) =>
                  setTransitionTarget({
                    candidate,
                    mode: "reactivate",
                  })
              : undefined
          }
          onUpdated={invalidateAll}
          onViewRoundDetail={(roundId) => {
            setInterviewDetailDefaultTab("reports");
            setInterviewRoundDetailId(roundId);
            setInterviewDetailDialogOpen(true);
          }}
          recordId={recordId}
          shell={({ body, description, headerExtra, title }) => (
            <div className="flex min-w-0 flex-col gap-5">
              <RecruiterResumeDetailHeaderOverride onBack={navigateBackToList} />
              <header className="flex min-w-0 flex-col gap-4 border-border/70 border-b pb-4">
                <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <RecruiterResumeDetailHeaderText description={description} title={title} />
                  </div>
                </div>
                <div className="min-w-0">{headerExtra}</div>
              </header>
              {body}
            </div>
          )}
        />
      </main>

      <StudioPersonDetailDialog
        defaultTab={interviewDetailDefaultTab}
        mode="interview"
        onOpenChange={setInterviewDetailDialogOpen}
        onOpenChangeComplete={(open) => {
          if (!open && !interviewDetailDialogOpen) {
            setInterviewRoundDetailId(null);
            setInterviewDetailDefaultTab("overview");
          }
        }}
        onUpdated={invalidateAll}
        open={interviewDetailDialogOpen}
        recordId={interviewRoundDetailId}
      />

      <LaunchInterviewDialog
        candidateName={launchingRecord?.candidateName ?? null}
        onLaunched={(round) => {
          invalidateAll();
          setInterviewDetailDefaultTab("overview");
          setInterviewRoundDetailId(round.id);
          setInterviewDetailDialogOpen(true);
        }}
        onOpenChange={(open) => !open && setLaunchingRecord(null)}
        open={launchingRecord !== null}
        recordId={launchingRecord?.id ?? null}
      />

      <TransitionCandidateDialog
        candidate={transitionTarget?.candidate ?? null}
        initialOutcome={transitionTarget?.initialOutcome}
        mode={transitionTarget?.mode ?? "close"}
        onCompleted={invalidateAll}
        onOpenChange={(open) => !open && setTransitionTarget(null)}
        open={transitionTarget !== null}
      />

      <StudioPersonEditDialog
        mode="resume"
        onOpenChange={(open) => !open && setEditRecordId(null)}
        onUpdated={() => invalidateAll()}
        open={editRecordId !== null}
        recordId={editRecordId}
      />

      <StudioResumeFloatingChat />
    </>
  );
}

export const Route = createFileRoute("/w/$slug/studio/resumes/$recordId")({
  component: RecruiterResumeDetailPage,
  head: () => ({
    meta: [{ title: "候选人详情" }],
  }),
  loader: async (loaderContext) => {
    const { params } = loaderContext as unknown as {
      params: { recordId: string; slug: string };
    };
    const pathname = `/w/${params.slug}/studio/resumes/${params.recordId}`;
    await requireStudioPageAccess({
      action: "resumes",
      pathname,
      slug: params.slug,
    });
  },
  pendingComponent: RecruiterResumeDetailSkeleton,
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
});
