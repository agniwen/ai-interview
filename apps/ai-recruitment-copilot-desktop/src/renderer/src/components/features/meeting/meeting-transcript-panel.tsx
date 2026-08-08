import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { MeetingAccessRole } from "@arc/shared/meeting-recording";
import type {
  FinalMeetingTranscriptTurn,
  MeetingTranscriptResult,
} from "@arc/shared/meeting-transcription";
import { Button } from "@/components/ui/button";
import {
  desktopMeetingKeys,
  fetchMeetingTranscript,
  retryMeetingTranscript,
} from "@/lib/client/meetings";

export function transcriptSeekSeconds(startMs: number): number {
  return Math.max(0, startMs / 1000);
}

function formatTranscriptTime(timeMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return (hours > 0 ? [hours, minutes, seconds] : [minutes, seconds])
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function speakerLabel(speakerKey: string): string {
  if (speakerKey === "local") {
    return "本机";
  }
  const remoteNumber = speakerKey.match(/^remote-(\d+)$/)?.[1];
  return remoteNumber ? `远端 ${remoteNumber}` : "远端";
}

function VirtualTranscriptTurns({
  onSeek,
  turns,
}: {
  onSeek: (seconds: number) => void;
  turns: FinalMeetingTranscriptTurn[];
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: turns.length,
    estimateSize: () => 96,
    getItemKey: (index) => turns[index]?.id ?? index,
    getScrollElement: () => scrollRef.current,
    initialRect: { height: 448, width: 720 },
    overscan: 6,
  });
  return (
    <div className="max-h-[28rem] overflow-y-auto" ref={scrollRef}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const turn = turns[virtualItem.index];
          return turn ? (
            <article
              className="absolute left-0 top-0 grid w-full grid-cols-[auto_1fr] gap-3 border-b p-3"
              data-index={virtualItem.index}
              key={turn.id}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <Button
                aria-label={`跳转到 ${formatTranscriptTime(turn.startMs)}`}
                onClick={() => onSeek(transcriptSeekSeconds(turn.startMs))}
                size="sm"
                type="button"
                variant="outline"
              >
                {formatTranscriptTime(turn.startMs)}
              </Button>
              <div className="min-w-0">
                <p className="mb-1 text-muted-foreground text-xs">
                  {speakerLabel(turn.speakerKey)}
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{turn.text}</p>
              </div>
            </article>
          ) : null;
        })}
      </div>
    </div>
  );
}

export function MeetingTranscriptView({
  canRetry,
  onRetry,
  onSeek,
  result,
  retrying = false,
}: {
  canRetry: boolean;
  onRetry: () => void;
  onSeek: (seconds: number) => void;
  result: MeetingTranscriptResult;
  retrying?: boolean;
}) {
  if (result.state === "pending") {
    return (
      <p className="text-muted-foreground text-sm">
        等待 Workspace 管理员配置并选择转录服务，或等待进入处理队列。
      </p>
    );
  }
  if (result.state === "processing") {
    return <p className="text-muted-foreground text-sm">正在生成 Final Meeting Transcript…</p>;
  }
  if (result.state === "failed") {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-destructive text-sm">{result.error ?? "最终会议转录失败"}</p>
        {canRetry ? (
          <Button disabled={retrying} onClick={onRetry} type="button">
            {retrying ? "正在重试…" : "重试最终转录"}
          </Button>
        ) : null}
      </div>
    );
  }
  if (!result.revision) {
    return <p className="text-muted-foreground text-sm">Final Meeting Transcript 暂不可用。</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        Final revision {result.revision.revision} · {result.revision.provider} ·{" "}
        {result.revision.model}
      </p>
      {result.revision.turns.length === 0 ? (
        <p className="text-muted-foreground text-sm">此录音没有识别到语音。</p>
      ) : (
        <VirtualTranscriptTurns onSeek={onSeek} turns={result.revision.turns} />
      )}
    </div>
  );
}

function transcriptRefetchInterval(result: MeetingTranscriptResult | undefined): number | false {
  return result?.state === "pending" || result?.state === "processing" ? 5000 : false;
}

export function MeetingTranscriptPanel({
  accessRole,
  meetingId,
  onSeek,
  slug,
}: {
  accessRole: MeetingAccessRole;
  meetingId: string;
  onSeek: (seconds: number) => void;
  slug: string;
}) {
  const queryClient = useQueryClient();
  const transcriptKey = desktopMeetingKeys.transcript(slug, meetingId);
  const transcriptQuery = useQuery({
    enabled: Boolean(slug),
    queryFn: () => fetchMeetingTranscript(slug, meetingId),
    queryKey: transcriptKey,
    refetchInterval: (query) => transcriptRefetchInterval(query.state.data),
  });
  const retryMutation = useMutation({
    mutationFn: () => retryMeetingTranscript(slug, meetingId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: transcriptKey }),
  });
  const canRetry = accessRole === "administrator" || accessRole === "owner";
  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-4">
        <h2 className="font-medium">Final Meeting Transcript</h2>
        <p className="text-muted-foreground text-xs">
          由已验证的双轨录音生成；Live Draft 不会复制或提升为最终版本。
        </p>
      </div>
      {transcriptQuery.isPending ? (
        <p className="text-muted-foreground text-sm">正在加载 Final Meeting Transcript…</p>
      ) : null}
      {transcriptQuery.error ? (
        <p className="text-destructive text-sm">
          {transcriptQuery.error instanceof Error
            ? transcriptQuery.error.message
            : "加载最终会议转录失败"}
        </p>
      ) : null}
      {transcriptQuery.data ? (
        <MeetingTranscriptView
          canRetry={canRetry}
          onRetry={() => retryMutation.mutate()}
          onSeek={onSeek}
          result={transcriptQuery.data}
          retrying={retryMutation.isPending}
        />
      ) : null}
    </section>
  );
}
