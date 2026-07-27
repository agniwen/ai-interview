import { createFileRoute, useParams } from "@tanstack/react-router";
import { StudioCalendarPage } from "@/components/features/studio/calendar/studio-calendar-page";
import { formatDocumentTitle } from "@/lib/start/document-title";
import { requireStudioPageAccess } from "@/lib/start/studio/page-access";

function StudioCalendarRoute() {
  const { slug } = useParams({ from: "/w/$slug/studio/calendar" });
  return <StudioCalendarPage slug={slug} />;
}

export const Route = createFileRoute("/w/$slug/studio/calendar")({
  loader: async ({ params }) => {
    await requireStudioPageAccess({
      action: "interviews",
      pathname: `/w/${params.slug}/studio/calendar`,
      slug: params.slug,
    });
  },
  head: () => ({
    meta: [{ title: formatDocumentTitle("日程管理") }],
  }),
  component: StudioCalendarRoute,
});
