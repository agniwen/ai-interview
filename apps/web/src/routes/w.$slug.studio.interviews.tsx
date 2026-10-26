import { Outlet, createFileRoute, useParams, useRouterState } from "@tanstack/react-router";
import { InterviewManagementPage } from "@/components/features/studio/interviews/interview-management-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceStudioInterviewsSearch } from "@/lib/client/studio-interviews-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

function StudioInterviewsRoute() {
  const { slug } = useParams({ from: "/w/$slug/studio/interviews" });
  const pathname = useRouterState({ select: (routerState) => routerState.location.pathname });

  if (pathname !== `/w/${slug}/studio/interviews`) {
    return <Outlet />;
  }

  return <InterviewManagementPage />;
}

export const Route = createFileRoute("/w/$slug/studio/interviews")({
  loader: ({ parentMatchPromise }) => requireStudioPagePermission(parentMatchPromise, "interviews"),
  validateSearch: (search) => coerceStudioInterviewsSearch(search),
  head: () => ({
    meta: [{ title: formatDocumentTitle("面试记录") }],
  }),
  component: StudioInterviewsRoute,
  pendingComponent: () => (
    <StudioTablePageSkeleton columnCount={12} filterCount={3} label="面试记录" summary />
  ),
  shouldReload: false,
});
