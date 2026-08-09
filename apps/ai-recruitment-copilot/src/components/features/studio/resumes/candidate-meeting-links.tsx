"use client";

import { useQuery } from "@tanstack/react-query";
import type { MeetingLibraryItem } from "@arc/shared/meeting-recording";
import { fetchStudioResumeMeetings } from "@/lib/client/api";

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function CandidateMeetingLinksView({ meetings }: { meetings: MeetingLibraryItem[] }) {
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4">
      <div>
        <h3 className="font-medium text-sm">关联会议</h3>
        <p className="text-muted-foreground text-xs">
          仅展示你有权限访问、且关联到这条 Candidate Recruiting Record 的 Meeting Session。
        </p>
      </div>
      {meetings.length === 0 ? (
        <p className="mt-4 text-muted-foreground text-sm">暂无有权限访问的关联 Meeting Session。</p>
      ) : (
        <div className="mt-4 divide-y rounded-lg border">
          {meetings.map((meeting) => (
            <article className="flex items-center justify-between gap-4 p-3" key={meeting.id}>
              <div className="min-w-0">
                <p className="truncate font-medium text-sm">{meeting.title}</p>
                <p className="text-muted-foreground text-xs">
                  {meeting.creator.name} · {new Date(meeting.savedAt).toLocaleString("zh-CN")}
                </p>
              </div>
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {formatDuration(meeting.durationMs)}
              </span>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function CandidateMeetingLinks({
  candidateId,
  slug,
}: {
  candidateId: string;
  slug: string;
}) {
  const query = useQuery({
    queryFn: () => fetchStudioResumeMeetings(slug, candidateId),
    queryKey: ["studio-resumes", slug, "detail", candidateId, "meetings"] as const,
  });
  if (query.isPending) {
    return <p className="text-muted-foreground text-sm">正在加载关联会议…</p>;
  }
  if (query.error) {
    return (
      <p className="text-destructive text-sm">
        {query.error instanceof Error ? query.error.message : "加载候选人关联会议失败"}
      </p>
    );
  }
  return <CandidateMeetingLinksView meetings={query.data ?? []} />;
}
