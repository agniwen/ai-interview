import { Outlet, createFileRoute } from "@tanstack/react-router";
import { StudioLayout } from "@/components/features/studio/studio-layout";
import { documentTitleMeta } from "@/lib/start/document-title";

function StudioShellRoute() {
  return (
    <StudioLayout>
      <Outlet />
    </StudioLayout>
  );
}

export const Route = createFileRoute("/w/$slug/studio")({
  ssr: "data-only",
  // Page permissions are checked by each page route; see requireStudioPagePermission.
  loader: async ({ parentMatchPromise }) => {
    const workspaceMatch = await parentMatchPromise;
    return workspaceMatch.loaderData ?? null;
  },
  head: ({ matches }) => ({
    meta: [
      {
        content: "Studio 管理后台。",
        name: "description",
      },
      ...documentTitleMeta(matches),
    ],
  }),
  component: StudioShellRoute,
});
