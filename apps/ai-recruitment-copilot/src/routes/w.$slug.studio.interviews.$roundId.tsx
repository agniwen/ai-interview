import { createFileRoute, useParams } from "@tanstack/react-router";
import { InterviewRoundDetailPage } from "@/components/studio/interviews/interview-round-detail-page";

function StudioInterviewRoundDetailRoute() {
  const { roundId, slug } = useParams({ from: "/w/$slug/studio/interviews/$roundId" });

  return <InterviewRoundDetailPage roundId={roundId} slug={slug} />;
}

export const Route = createFileRoute("/w/$slug/studio/interviews/$roundId")({
  component: StudioInterviewRoundDetailRoute,
  head: () => ({
    meta: [{ title: "面试详情" }],
  }),
});
