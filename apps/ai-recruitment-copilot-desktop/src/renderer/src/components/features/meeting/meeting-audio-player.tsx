import { useEffect, useRef, useState } from "react";
import type { MeetingPlaybackAuthorization } from "@arc/shared/meeting-recording";
import { cn } from "@arc/shared/utils";
import {
  AudioPlayerButton,
  AudioPlayerDuration,
  AudioPlayerProvider,
  AudioPlayerSpeed,
  AudioPlayerTime,
  useAudioPlayer,
  useAudioPlayerTime,
} from "@/components/ui/audio-player";
import { AudioScrubber } from "@/components/ui/waveform";
import { extractWaveformPeaks, placeholderWaveform } from "@/lib/client/audio-waveform";
import {
  MEETING_COMPOSER_RADIUS,
  MeetingComposerFrame,
  MeetingComposerRow,
} from "./meeting-recording-session-layout";

const PLAYBACK_ITEM_ID = "meeting-playback";
const CONTROL_CLASS = cn("size-8 shrink-0", MEETING_COMPOSER_RADIUS);
const TIME_CLASS = "w-10 shrink-0 text-center text-xs leading-none";
const WAVEFORM_HEIGHT = 32;

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

function useMeetingWaveform(url: string): number[] {
  const [peaks, setPeaks] = useState(() => placeholderWaveform());
  useEffect(() => {
    let cancelled = false;
    const loadPeaks = async () => {
      try {
        const nextPeaks = await extractWaveformPeaks(url);
        if (!cancelled) {
          setPeaks(nextPeaks);
        }
      } catch {
        if (!cancelled) {
          setPeaks(placeholderWaveform());
        }
      }
    };
    void loadPeaks();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return peaks;
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
    <MeetingComposerRow className={className} slot="meeting-audio-player">
      <AudioPlayerButton className={CONTROL_CLASS} item={item} size="icon-sm" variant="outline" />
      <AudioPlayerTime className={TIME_CLASS} />
      <AudioScrubber
        className="min-w-0 flex-1"
        currentTime={currentTime}
        data={waveform}
        duration={player.duration ?? 0}
        height={WAVEFORM_HEIGHT}
        onSeek={(time) => player.seek(time)}
      />
      <AudioPlayerDuration className={TIME_CLASS} />
      <AudioPlayerSpeed className={cn(CONTROL_CLASS, "min-w-8 px-1")} />
    </MeetingComposerRow>
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

/** 已结束 session 底部的回放条，外壳与录制中 floating bar 相同。 */
export function MeetingPlaybackComposer(props: MeetingAudioPlayerProps) {
  return (
    <MeetingComposerFrame>
      <MeetingAudioPlayer {...props} />
    </MeetingComposerFrame>
  );
}
