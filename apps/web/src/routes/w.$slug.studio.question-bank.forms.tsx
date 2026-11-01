import {
  Outlet,
  useRouterState,
  createFileRoute,
  getRouteApi,
  notFound,
  redirect,
} from "@tanstack/react-router";
import { FormTemplateEditorSkeleton } from "@/components/features/studio/forms/form-template-editor-skeleton";
import { CandidateFormTemplateManagementPage } from "@/components/features/studio/forms/form-template-management-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioFormsState } from "@/lib/start/studio/forms.functions";

const routeApi = getRouteApi("/w/$slug/studio/question-bank/forms");

function StudioFormsRoute() {
  const state = routeApi.useLoaderData();
  const activeRouteId = useRouterState({
    select: (routerState) => routerState.matches.at(-1)?.routeId,
  });
  const isList = activeRouteId === "/w/$slug/studio/question-bank/forms";
  const isOverlay =
    activeRouteId?.startsWith("/w/$slug/studio/question-bank/forms/overlay/") ?? false;
  if (state.status !== "ready") {
    return null;
  }
  return (
    <>
      {isList || isOverlay ? (
        <div
          className="contents"
          aria-hidden={isOverlay || undefined}
          inert={isOverlay || undefined}
        >
          <CandidateFormTemplateManagementPage jobDescriptions={state.jobDescriptions} />
        </div>
      ) : null}
      {isList ? null : <Outlet />}
    </>
  );
}

function StudioFormsPending() {
  const isEditor = useRouterState({
    select: (state) => /\/question-bank\/forms\/[^/]+/.test(state.location.pathname),
  });
  return isEditor ? (
    <FormTemplateEditorSkeleton />
  ) : (
    <StudioTablePageSkeleton columnCount={8} filterCount={3} header={false} label="表单题" />
  );
}

// 页面权限由父路由「面试题」校验，服务端函数同样按页面权限鉴权。
// The question bank parent route checks the page permission; the server function re-checks it.
export const Route = createFileRoute("/w/$slug/studio/question-bank/forms")({
  validateSearch: coerceSearchParams,
  loader: async ({ params }) => {
    const state = await loadStudioFormsState({ data: { slug: params.slug } });
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(
          `/w/${params.slug}/studio/question-bank/forms`,
        )}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({ meta: [{ title: formatDocumentTitle("表单题 · 面试题") }] }),
  component: StudioFormsRoute,
  pendingComponent: StudioFormsPending,
  shouldReload: false,
});
