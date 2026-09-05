import { useEffect, useRef, useState } from "react";
import type { MeetingPlaybackAuthorization } from "@app/shared/meeting-recording";
import { cn } from "@app/shared/utils";
import {
  AudioPlayerButton,
  AudioPlayerElapsedDuration,
  AudioPlayerProvider,
  AudioPlayerSpeed,
  useAudioPlayer,
  useAudioPlayerTime,
} from "@/components/ui/audio-player";
import { AudioScrubber } from "@/components/ui/waveform";
import { loadWaveformPeaks } from "@/lib/client/audio-waveform";
import type { WaveformLoadResult } from "@/lib/client/audio-waveform";

const PLAYBACK_ITEM_ID = "meeting-playback";
const WAVEFORM_HEIGHT = 48;

export interface MeetingAudioPlayerProps {
  className?: string;
  onPlaybackError?: () => void;
  playback: MeetingPlaybackAuthorization;
  seekRequestId?: number;
  seekToSeconds?: number;
}

async function resumeAudio(audio: HTMLAudioElement, onAbort: () => void): Promise<void> {
  try {
    await audio.play();
  } catch {
    onAbort();
  }
}

type MeetingWaveformState = WaveformLoadResult | { peaks: []; status: "loading" };

const LOADING_WAVEFORM: MeetingWaveformState = { peaks: [], status: "loading" };

function useMeetingWaveform(url: string): MeetingWaveformState {
  const [waveform, setWaveform] = useState<MeetingWaveformState>(LOADING_WAVEFORM);
  useEffect(() => {
    let cancelled = false;
    const loadPeaks = async () => {
      setWaveform(LOADING_WAVEFORM);
      const nextWaveform = await loadWaveformPeaks(url);
      if (!cancelled) {
        setWaveform(nextWaveform);
      }
    };
    void loadPeaks();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return waveform;
}

function MeetingAudioPlayerControls({
  className,
  onPlaybackError,
  playback,
  seekRequestId,
  seekToSeconds,
}: MeetingAudioPlayerProps) {
  const player = useAudioPlayer();
  const currentTime = useAudioPlayerTime();
  const waveform = useMeetingWaveform(playback.url);
  const playerRef = useRef(player);
  playerRef.current = player;
  const lastPositionRef = useRef(seekToSeconds ?? 0);
  const previousUrlRef = useRef(playback.url);
  const refreshingSourceRef = useRef(false);
  const shouldResumeRef = useRef(false);
  const item = { id: PLAYBACK_ITEM_ID, src: playback.url };

  useEffect(() => {
    void playerRef.current.setActiveItem({
      id: PLAYBACK_ITEM_ID,
      src: previousUrlRef.current,
    });
  }, []);

  useEffect(() => {
    const audio = playerRef.current.ref.current;
    if (!audio || previousUrlRef.current === playback.url) {
      return;
    }
    previousUrlRef.current = playback.url;
    refreshingSourceRef.current = true;
    const position = lastPositionRef.current;
    audio.src = playback.url;
    audio.load();
    const restore = () => {
      audio.currentTime = position;
      refreshingSourceRef.current = false;
      if (shouldResumeRef.current) {
        void resumeAudio(audio, () => {
          shouldResumeRef.current = false;
        });
      }
      audio.removeEventListener("loadedmetadata", restore);
    };
    audio.addEventListener("loadedmetadata", restore);
    return () => audio.removeEventListener("loadedmetadata", restore);
  }, [playback.url]);

  useEffect(() => {
    if (seekToSeconds === undefined) {
      return;
    }
    lastPositionRef.current = seekToSeconds;
    playerRef.current.seek(seekToSeconds);
  }, [seekRequestId, seekToSeconds]);

  useEffect(() => {
    const audio = player.ref.current;
    if (!audio) {
      return;
    }
    const onPlay = () => {
      shouldResumeRef.current = true;
    };
    const onPause = () => {
      if (!(refreshingSourceRef.current || audio.ended)) {
        shouldResumeRef.current = false;
      }
    };
    const onEnded = () => {
      shouldResumeRef.current = false;
    };
    const onTimeUpdate = () => {
      lastPositionRef.current = audio.currentTime;
    };
    const onError = () => {
      refreshingSourceRef.current = true;
      onPlaybackError?.();
    };
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("error", onError);
    return () => {
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("error", onError);
    };
  }, [onPlaybackError, player.ref]);

  return (
    <div className={cn("grid min-w-0 gap-3 px-3 pb-1", className)} data-slot="meeting-audio-player">
      <div
        className="flex min-w-0 items-center"
        data-slot="meeting-playback-waveform-row"
        data-waveform-state={waveform.status}
      >
        <AudioScrubber
          aria-label={waveform.status === "ready" ? "录音波形" : "录音进度"}
          barGap={5}
          barRadius={2}
          barWidth={2}
          className="w-full min-w-0"
          currentTime={currentTime}
          data={waveform.peaks}
          duration={player.duration ?? 0}
          fadeEdges
          height={WAVEFORM_HEIGHT}
          onSeek={(time) => player.seek(time)}
          showHandle={false}
        />
      </div>
      <div
        className="grid min-w-0 grid-cols-[1fr_auto_1fr] items-center gap-3"
        data-slot="meeting-playback-controls"
      >
        <AudioPlayerElapsedDuration className="min-w-0 truncate pl-1 text-xs leading-none" />
        <AudioPlayerButton
          className="h-12 w-[4.8rem] rounded-full border-transparent bg-primary/10 text-primary shadow-none hover:border-transparent hover:bg-primary/15 hover:text-primary focus-visible:border-transparent focus-visible:ring-0 dark:hover:bg-primary/15"
          item={item}
          size="icon"
          variant="ghost"
        />
        <AudioPlayerSpeed className="h-10 w-[3.2rem] min-w-0 justify-self-end rounded-full border-transparent bg-muted px-0 text-foreground shadow-none hover:bg-muted/80 hover:text-foreground" />
      </div>
    </div>
  );
}

/**
 * 会议录音回放条：播放、波形进度、时间和倍速，可供详情页与 session 页复用。
 * Meeting playback bar with play, waveform scrubber, time and speed for detail and session pages.
 */
export function MeetingAudioPlayer(props: MeetingAudioPlayerProps) {
  return (
    <AudioPlayerProvider>
      <MeetingAudioPlayerControls {...props} />
    </AudioPlayerProvider>
  );
}

/** 已结束 session 底部的回放区，与录制中 composer 使用同一开放式布局。 */
export function MeetingPlaybackComposer(props: MeetingAudioPlayerProps) {
  return <MeetingAudioPlayer {...props} />;
}
