import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import type {
  MeetingDetail,
  MeetingLibraryItem,
  MeetingPlaybackAuthorization,
  MeetingProcessingState,
} from "@arc/shared/meeting-recording";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Frame,
  FrameDescription,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from "@/components/ui/frame";

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

function MeetingSummary({ meeting }: { meeting: MeetingLibraryItem }) {
  const state = PROCESSING_STATE_META[meeting.processingState];
  return (
    <Frame className="h-full">
      <FrameHeader className="justify-between gap-3">
        <FrameTitle className="truncate">{meeting.title}</FrameTitle>
        <Badge variant={state.variant}>{state.label}</Badge>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-3">
        <FrameDescription>
          {meeting.creator.name} · {new Date(meeting.savedAt).toLocaleString("zh-CN")}
        </FrameDescription>
        <div className="flex items-center justify-between text-sm">
          <span>{formatMeetingDuration(meeting.durationMs)}</span>
          <span className="text-muted-foreground">
            {meeting.recordingAvailable ? "录音可用" : "录音准备中"}
          </span>
        </div>
      </FramePanel>
    </Frame>
  );
}

export function MeetingLibraryView({
  meetings,
  renderMeeting,
}: {
  meetings: MeetingLibraryItem[];
  renderMeeting?: (meeting: MeetingLibraryItem, content: ReactNode) => ReactNode;
}) {
  if (meetings.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium text-sm">还没有已保存的会议</p>
        <p className="mt-1 text-muted-foreground text-xs">结束并保存录制后，会议会出现在这里</p>
      </div>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {meetings.map((meeting) => {
        const content = <MeetingSummary meeting={meeting} />;
        return (
          <div key={meeting.id}>{renderMeeting ? renderMeeting(meeting, content) : content}</div>
        );
      })}
    </div>
  );
}

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
  const state = PROCESSING_STATE_META[meeting.processingState];
  return (
    <Frame>
      <FrameHeader className="justify-between gap-3">
        <FrameTitle className="truncate">{meeting.title}</FrameTitle>
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
            <p>{new Date(meeting.savedAt).toLocaleString("zh-CN")}</p>
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
