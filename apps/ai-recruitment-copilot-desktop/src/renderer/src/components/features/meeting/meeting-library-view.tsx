import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type {
  MeetingDetail,
  MeetingLibraryItem,
  MeetingPlaybackAuthorization,
  MeetingProcessingState,
} from "@arc/shared/meeting-recording";
import type { MeetingLibrarySearchMatch } from "@arc/shared/meeting-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAppDateTime } from "@/lib/client/datetime";
import { meetingDisplayTitle } from "@arc/shared/utils/time";

const PROCESSING_STATE_META: Record<
  MeetingProcessingState,
  { label: string; variant: "success" | "warning" | "danger" }
> = {
  failed: { label: "处理失败", variant: "danger" },
  processing: { label: "处理中", variant: "warning" },
  ready: { label: "可播放", variant: "success" },
};

export function formatMeetingDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  }
  return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function MeetingNameCell({
  meeting,
  searchMatch,
}: {
  meeting: MeetingLibraryItem;
  searchMatch?: MeetingLibrarySearchMatch;
}) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-foreground">{meetingDisplayTitle(meeting.title)}</p>
      <p className="mt-1 truncate text-muted-foreground text-xs">
        {formatMeetingDuration(meeting.durationMs)} ·{" "}
        {meeting.recordingAvailable ? "录音可用" : "录音准备中"}
      </p>
      {searchMatch ? (
        <div className="mt-1 min-w-0 text-muted-foreground text-xs">
          <p className="truncate">{searchMatch.snippet}</p>
          {searchMatch.startMs === null ? null : (
            <span className="tabular-nums">
              {formatMeetingDuration(searchMatch.startMs)}
              {searchMatch.endMs === null ? null : `–${formatMeetingDuration(searchMatch.endMs)}`}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function MeetingLibraryView({
  emptyDescription = "结束并保存后，录制会出现在这里",
  emptyTitle = "还没有已保存的录制",
  meetings,
  renderMeeting,
  searchMatches,
}: {
  emptyDescription?: string;
  emptyTitle?: string;
  meetings: MeetingLibraryItem[];
  renderMeeting?: (meeting: MeetingLibraryItem, content: ReactNode) => ReactNode;
  searchMatches?: Record<string, MeetingLibrarySearchMatch>;
}) {
  if (meetings.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium text-sm">{emptyTitle}</p>
        <p className="mt-1 text-muted-foreground text-xs">{emptyDescription}</p>
      </div>
    );
  }
  return (
    <div className="w-full overflow-hidden rounded-lg border">
      <Table aria-label="录制记录表格" className="min-w-[680px] table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[300px]">录制名称</TableHead>
            <TableHead className="w-[160px]">日期</TableHead>
            <TableHead className="w-[120px]">状态</TableHead>
            <TableHead className="w-[150px]">创建者</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {meetings.map((meeting) => {
            const state = PROCESSING_STATE_META[meeting.processingState];
            const nameCell = (
              <MeetingNameCell meeting={meeting} searchMatch={searchMatches?.[meeting.id]} />
            );
            return (
              <TableRow key={meeting.id}>
                <TableCell>{renderMeeting ? renderMeeting(meeting, nameCell) : nameCell}</TableCell>
                <TableCell className="text-muted-foreground tabular-nums">
                  {formatAppDateTime(meeting.savedAt)}
                </TableCell>
                <TableCell>
                  <Badge variant={state.variant}>{state.label}</Badge>
                </TableCell>
                <TableCell className="truncate text-muted-foreground">
                  {meeting.creator.name}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * 可续签播放器：签名 URL 更新时保留 currentTime 和播放意图，避免五分钟授权轮换打断用户。
 * Renewable player preserving currentTime and play intent while short-lived signed URLs rotate.
 */
function MeetingAudioPlayer({
  onPlaybackError,
  playback,
  seekRequestId,
  seekToSeconds,
}: {
  onPlaybackError?: () => void;
  playback: MeetingPlaybackAuthorization;
  seekRequestId?: number;
  seekToSeconds?: number;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const lastPositionRef = useRef(seekToSeconds ?? 0);
  const previousUrlRef = useRef(playback.url);
  const refreshingSourceRef = useRef(false);
  const shouldResumeRef = useRef(false);
  useEffect(() => {
    if (previousUrlRef.current !== playback.url) {
      refreshingSourceRef.current = true;
      previousUrlRef.current = playback.url;
    }
  }, [playback.url]);
  useEffect(() => {
    if (audioRef.current && seekToSeconds !== undefined) {
      audioRef.current.currentTime = seekToSeconds;
      lastPositionRef.current = seekToSeconds;
    }
  }, [seekRequestId, seekToSeconds]);
  const resumePlayback = async (audio: HTMLAudioElement) => {
    try {
      await audio.play();
    } catch {
      shouldResumeRef.current = false;
    }
  };
  return (
    // oxlint-disable-next-line jsx-a11y/media-has-caption -- transcript track is delivered by #76
    <audio
      aria-label="会议录音播放器"
      className="w-full"
      controls
      onEnded={() => {
        shouldResumeRef.current = false;
      }}
      onError={() => {
        refreshingSourceRef.current = true;
        onPlaybackError?.();
      }}
      onLoadedMetadata={(event) => {
        const position = lastPositionRef.current;
        if (position > 0) {
          event.currentTarget.currentTime = position;
        }
        refreshingSourceRef.current = false;
        if (shouldResumeRef.current) {
          void resumePlayback(event.currentTarget);
        }
      }}
      onPause={(event) => {
        if (!(refreshingSourceRef.current || event.currentTarget.ended)) {
          shouldResumeRef.current = false;
        }
      }}
      onPlay={() => {
        shouldResumeRef.current = true;
      }}
      onTimeUpdate={(event) => {
        lastPositionRef.current = event.currentTarget.currentTime;
      }}
      preload="metadata"
      ref={audioRef}
      src={playback.url}
    />
  );
}

export function MeetingDetailView({
  meeting,
  onPlaybackError,
  onRetryProcessing,
  playback,
  retryProcessing = false,
  seekRequestId,
  seekToSeconds,
}: {
  meeting: MeetingDetail;
  onPlaybackError?: () => void;
  onRetryProcessing?: () => void;
  playback: MeetingPlaybackAuthorization | null;
  retryProcessing?: boolean;
  seekRequestId?: number;
  seekToSeconds?: number;
}) {
  // 这是无数据副作用的展示组件；重试、续签和跨面板 seek 都由 MeetingDetailPage 编排。
  // This is a side-effect-free view; retries, authorization refresh, and cross-panel seeking live in MeetingDetailPage.
  const state = PROCESSING_STATE_META[meeting.processingState];
  return (
    <Frame>
      <FrameHeader className="justify-between gap-3">
        <FrameTitle className="truncate">{meetingDisplayTitle(meeting.title)}</FrameTitle>
        <Badge variant={state.variant}>{state.label}</Badge>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-5">
        <div className="grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs">创建者</p>
            <p>{meeting.creator.name}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">时长</p>
            <p>{formatMeetingDuration(meeting.durationMs)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">保存时间</p>
            <p>{formatAppDateTime(meeting.savedAt)}</p>
          </div>
        </div>
        {playback ? (
          <MeetingAudioPlayer
            onPlaybackError={onPlaybackError}
            playback={playback}
            seekRequestId={seekRequestId}
            seekToSeconds={seekToSeconds}
          />
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">
              {meeting.processingState === "failed"
                ? "录音处理失败；原始双轨录音仍然保留。"
                : "正在从双轨源生成播放音频。"}
            </p>
            {meeting.processingState === "failed" && onRetryProcessing ? (
              <Button disabled={retryProcessing} onClick={onRetryProcessing} type="button">
                {retryProcessing ? "正在重试…" : "重试处理"}
              </Button>
            ) : null}
          </div>
        )}
      </FramePanel>
    </Frame>
  );
}
