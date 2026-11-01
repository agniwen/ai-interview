import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/features/studio/profile/profile-page";
import { ProfilePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { requireStudioPagePermission } from "@/lib/start/studio-page-permission";

export const Route = createFileRoute("/w/$slug/studio/me")({
  loader: ({ parentMatchPromise }) => requireStudioPagePermission(parentMatchPromise, "me"),
  component: ProfilePage,
  head: () => ({
    meta: [{ title: formatDocumentTitle("个人中心") }],
  }),
  pendingComponent: ProfilePageSkeleton,
});
