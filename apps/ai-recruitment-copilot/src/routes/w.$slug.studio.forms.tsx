import { createFileRoute, notFound, redirect, useLoaderData } from "@tanstack/react-router";
import { CandidateFormTemplateManagementPage } from "@/components/features/studio/forms/form-template-management-page";
import { StudioTablePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { coerceSearchParams } from "@/lib/client/data-grid-search";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { loadStudioFormsState } from "@/lib/start/studio/forms.functions";
import type { StudioFormsState } from "@/lib/start/studio/forms.functions";

function StudioFormsRoute() {
  const state = useLoaderData({ from: "/w/$slug/studio/forms" }) as unknown as StudioFormsState;
  return state.status === "ready" ? (
    <CandidateFormTemplateManagementPage jobDescriptions={state.jobDescriptions} />
  ) : null;
}

export const Route = createFileRoute("/w/$slug/studio/forms")({
  validateSearch: (search: Record<string, unknown>) => coerceSearchParams(search),
  loader: async ({ params }) => {
    const state = (await loadStudioFormsState({ data: { slug: params.slug } })) as StudioFormsState;
    if (state.status === "unauthenticated") {
      throw redirect({
        href: `/login?callbackURL=${encodeURIComponent(`/w/${params.slug}/studio/forms`)}`,
      });
    }
    if (state.status === "not_found") {
      throw notFound();
    }
    return state;
  },
  head: () => ({ meta: [{ title: formatDocumentTitle("表单题") }] }),
  component: StudioFormsRoute,
  pendingComponent: () => <StudioTablePageSkeleton filterCount={3} label="表单题" />,
  shouldReload: false,
});
