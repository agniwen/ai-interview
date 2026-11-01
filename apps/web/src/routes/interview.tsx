import { Outlet, createFileRoute } from "@tanstack/react-router";
import { InterviewCopyGuard } from "@/components/features/interview/interview-copy-guard";
import { formatDocumentTitle } from "@/lib/start/document-title";

function InterviewQuickStartRoute() {
  return (
    <InterviewCopyGuard>
      <Outlet />
    </InterviewCopyGuard>
  );
}

export const Route = createFileRoute("/interview")({
  head: () => ({
    meta: [
      {
        content: "上传候选人简历，立即开始一场 AI 语音面试。",
        name: "description",
      },
      { title: formatDocumentTitle("AI 面试 · 快速开始") },
    ],
  }),
  component: InterviewQuickStartRoute,
});
