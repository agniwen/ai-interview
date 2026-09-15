import {
  createFileRoute,
  notFound,
  redirect,
  useLoaderData,
  useParams,
} from "@tanstack/react-router";
import { RecruitingDashboardPage } from "@/components/features/studio/dashboard/recruiting-dashboard-page";
import { DashboardPageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioDashboardState } from "@/lib/start/studio/dashboard.functions";

function StudioDashboardRoute() {
  const state = useLoaderData({ from: "/w/$slug/studio/dashboard" });
  const { slug } = useParams({ from: "/w/$slug/studio/dashboard" });

  if (state.status !== "ready") {
    return null;
  }

  return <RecruitingDashboardPage metrics={state.metrics} slug={slug} />;
}

export const Route = createFileRoute("/w/$slug/studio/dashboard")({
  loader: async ({ params }) => {
    const state = await loadStudioDashboardState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/dashboard`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({ meta: [{ title: formatDocumentTitle("数据看板") }] }),
  component: StudioDashboardRoute,
  pendingComponent: DashboardPageSkeleton,
});
