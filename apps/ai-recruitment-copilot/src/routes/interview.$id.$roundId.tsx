import { createFileRoute, useParams } from "@tanstack/react-router";
import InterviewRoom from "@/components/features/interview/interview-room";
import { formatDocumentTitle } from "@/lib/start/document-title";

function InterviewRoundRoute() {
  const { id, roundId } = useParams({ from: "/interview/$id/$roundId" });

  return <InterviewRoom interviewId={id} roundId={roundId} />;
}

export const Route = createFileRoute("/interview/$id/$roundId")({
  component: InterviewRoundRoute,
  head: () => ({
    meta: [
      {
        content: "根据候选人专属链接发起语音面试，并实时查看追问过程与作答记录。",
        name: "description",
      },
      { title: formatDocumentTitle("AI 面试") },
    ],
  }),
});
