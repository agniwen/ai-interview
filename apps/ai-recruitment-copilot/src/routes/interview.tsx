import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { InterviewCopyGuard } from "@/components/interview/interview-copy-guard";

function InterviewQuickStartRoute() {
  return (
    <InterviewCopyGuard>
      <Outlet />
    </InterviewCopyGuard>
  );
}

export const Route = createFileRoute("/interview")({
  component: InterviewQuickStartRoute,
  head: () => ({
    meta: [
      {
        content: "上传候选人简历，立即开始一场 AI 语音面试。",
        name: "description",
      },
      { title: "AI 面试 · 快速开始" },
    ],
  }),
  loader: (loaderContext) => {
    const { location } = loaderContext as { location: { pathname: string } };
    if (location.pathname === "/interview") {
      throw redirect({ href: "/" });
    }
    return null;
  },
});
