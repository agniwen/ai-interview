import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/components/features/studio/profile/profile-page";
import { ProfilePageSkeleton } from "@/components/features/studio/studio-page-skeletons";
import { formatDocumentTitle } from "@/lib/start/document-title";

export const Route = createFileRoute("/w/$slug/studio/me")({
  component: ProfilePage,
  head: () => ({
    meta: [{ title: formatDocumentTitle("个人中心") }],
  }),
  pendingComponent: ProfilePageSkeleton,
});
