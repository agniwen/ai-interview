import { IconAlertOctagon, IconCircleCheck } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
  useParams,
} from "@tanstack/react-router";
import { NO_ACCESS_WORKSPACE_ROLE } from "@arc/shared/permissions";
import type { ResumeEvaluationStatus } from "@arc/shared/studio-resumes";
import { describeResumeEvaluationStatus } from "@arc/shared/studio-resumes";

import { StudioPersonDetailPanel } from "@/components/features/studio/studio-person-detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchStudioResumeReview, submitResumeReviewEvaluation } from "@/lib/client/api";
import { WorkspaceSlugProvider, useWorkspaceSlug } from "@/lib/client/workspace-context";
import { getWorkspaceAccessState } from "@/lib/start/auth-session";
import { toast } from "sonner";

function resumeReviewDetailQueryKey(slug: string, recordId: string) {
  return ["studio-resumes", slug, "detail", recordId, "review"] as const;
}

function ResumeReviewEvaluationBar({
  isLoading,
  recordId,
  status,
}: {
  isLoading: boolean;
  recordId: string;
  status: ResumeEvaluationStatus | null | undefined;
}) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (nextStatus: ResumeEvaluationStatus) =>
      submitResumeReviewEvaluation(slug, recordId, nextStatus),
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "提交评估失败");
    },
    onSuccess: (detail) => {
      queryClient.setQueryData(resumeReviewDetailQueryKey(slug, recordId), detail);
      void queryClient.invalidateQueries({
        queryKey: ["studio-resumes", slug, "timeline", recordId, "review"],
      });
      toast.success("评估已提交");
    },
  });

  const hasSubmittedEvaluation = status !== null && status !== undefined;
  const disabled = isLoading || mutation.isPending;

  if (hasSubmittedEvaluation) {
    const meta = describeResumeEvaluationStatus(status);
    return (
      <div className="fixed right-0 bottom-0 left-0 z-20 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm">
          <span className="text-muted-foreground">评估结果</span>
          <Badge variant={meta.tone}>{meta.label}</Badge>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed right-0 bottom-0 left-0 z-20 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2">
        <Button disabled={disabled} onClick={() => mutation.mutate("pass")} type="button">
          <IconCircleCheck className="size-4" />
          评估通过
        </Button>
        <Button
          disabled={disabled}
          onClick={() => mutation.mutate("fail")}
          type="button"
          variant="outline"
        >
          <IconAlertOctagon className="size-4" />
          评估不通过
        </Button>
      </div>
    </div>
  );
}

function ResumeReviewDetailContent({ recordId }: { recordId: string }) {
  const slug = useWorkspaceSlug();
  const detailQuery = useQuery({
    queryFn: () => fetchStudioResumeReview(slug, recordId),
    queryKey: resumeReviewDetailQueryKey(slug, recordId),
    staleTime: 30_000,
  });
  const detail = detailQuery.data ?? null;

  return (
    <>
      <main className="mx-auto flex w-full max-w-[96rem] flex-col px-4 pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-8">
        <StudioPersonDetailPanel
          accessMode="review"
          layoutMode="page"
          mode="resume"
          recordId={recordId}
          shell={({ body, title }) => (
            <div className="flex flex-col gap-4">
              <header className="border-b pb-4">
                <h1 className="font-semibold text-xl tracking-normal">{title}</h1>
              </header>
              <div>{body}</div>
            </div>
          )}
        />
      </main>

      <ResumeReviewEvaluationBar
        isLoading={detailQuery.isLoading}
        recordId={recordId}
        status={detail?.resumeEvaluationStatus}
      />
    </>
  );
}

function ResumeReviewDetailPage() {
  const state = useLoaderData({ from: "/resume-review/$slug/$recordId" });
  const { recordId } = useParams({ from: "/resume-review/$slug/$recordId" });

  if (state.status !== "ready") {
    return null;
  }

  return (
    <WorkspaceSlugProvider
      id={state.workspace.id}
      memberRole={state.member.role}
      permissions={state.permissions}
      slug={state.workspace.slug}
    >
      <ResumeReviewDetailContent recordId={recordId} />
    </WorkspaceSlugProvider>
  );
}

export const Route = createFileRoute("/resume-review/$slug/$recordId")({
  component: ResumeReviewDetailPage,
  head: () => ({
    meta: [{ title: "简历评估" }],
  }),
  loader: async (loaderContext) => {
    const { location, params } = loaderContext as unknown as {
      location: { pathname: string };
      params: { recordId: string; slug: string };
    };
    const state = await getWorkspaceAccessState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(location.pathname)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    if (state.member.role === NO_ACCESS_WORKSPACE_ROLE) {
      throw redirect({ href: "/wait" });
    }
    return state;
  },
});
