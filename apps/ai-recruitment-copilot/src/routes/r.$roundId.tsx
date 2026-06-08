import { createFileRoute, useParams } from "@tanstack/react-router";
import { PublicInterviewRoundPage } from "@/components/public-interview-round/public-interview-round-page";

function PublicInterviewRoundRoute() {
  const { roundId } = useParams({ from: "/r/$roundId" });

  return <PublicInterviewRoundPage roundId={roundId} />;
}

export const Route = createFileRoute("/r/$roundId")({
  component: PublicInterviewRoundRoute,
  head: () => ({
    meta: [{ title: "面试详情" }],
  }),
});
