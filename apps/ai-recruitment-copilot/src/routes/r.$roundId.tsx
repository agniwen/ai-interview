import { createFileRoute, useParams } from "@tanstack/react-router";
import { StudioPersonDetailPanel } from "@/components/features/studio/studio-person-detail-panel";
import { formatDocumentTitle } from "@/lib/start/document-title";

// 公开访问入口：候选人面试详情独立页（无需登录）。
// 与 /w/[slug]/studio/interviews/[roundId] 共享同一份 StudioPersonDetailPanel
// 渲染，差异在 accessMode="public" —— 数据从 /api/public/* 拉，所有写操作被
// 隐藏。
//
// Public-access full-page view of an interview round detail. Renders the same
// StudioPersonDetailPanel as the authed studio path; data goes through
// /api/public/* and every mutation UI is suppressed via accessMode="public".

function PublicInterviewRoundPage({ roundId }: { roundId: string }) {
  return (
    <StudioPersonDetailPanel
      accessMode="public"
      mode="interview"
      recordId={roundId}
      shell={({ body, description, headerExtra, title }) => (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6 sm:px-6">
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl">{title}</h1>
            {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
          </header>
          {headerExtra}
          <div>{body}</div>
        </div>
      )}
    />
  );
}

function PublicInterviewRoundRoute() {
  const { roundId } = useParams({ from: "/r/$roundId" });

  return <PublicInterviewRoundPage roundId={roundId} />;
}

export const Route = createFileRoute("/r/$roundId")({
  component: PublicInterviewRoundRoute,
  head: () => ({
    meta: [{ title: formatDocumentTitle("面试详情") }],
  }),
});
