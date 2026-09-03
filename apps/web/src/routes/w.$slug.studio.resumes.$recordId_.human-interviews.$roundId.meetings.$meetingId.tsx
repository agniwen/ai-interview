import { createFileRoute } from "@tanstack/react-router";
import { HumanInterviewMeetingDetailPage } from "@/components/features/studio/human-interview-meeting-detail-page";
import { formatDocumentTitle } from "@/lib/start/document-title";

/* oxlint-disable no-use-before-define -- Route and its component reference each other. */
export const Route = createFileRoute(
  "/w/$slug/studio/resumes/$recordId_/human-interviews/$roundId/meetings/$meetingId",
)({
  component: MeetingDetailRoute,
  head: () => ({ meta: [{ title: formatDocumentTitle("会议详情") }] }),
});

function MeetingDetailRoute() {
  const { slug, recordId, roundId, meetingId } = Route.useParams();
  return (
    <HumanInterviewMeetingDetailPage
      key={meetingId}
      slug={slug}
      candidateId={recordId}
      roundId={roundId}
      meetingId={meetingId}
    />
  );
}
