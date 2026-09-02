import type { ComponentProps, HTMLProps, ReactNode, RefObject } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { cn } from "@app/shared/utils";

enum ReadyState {
  HAVE_FUTURE_DATA = 3,
}

enum NetworkState {
  NETWORK_LOADING = 2,
}

function formatPlayerTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const formattedMins = mins < 10 ? `0${mins}` : String(mins);
  const formattedSecs = secs < 10 ? `0${secs}` : String(secs);
  return hrs > 0 ? `${hrs}:${formattedMins}:${formattedSecs}` : `${mins}:${formattedSecs}`;
}

export interface AudioPlayerItem<TData = unknown> {
  data?: TData;
  id: number | string;
  src: string;
}

interface AudioPlayerApi<TData = unknown> {
  activeItem: AudioPlayerItem<TData> | null;
  duration: number | undefined;
  error: MediaError | null;
  isBuffering: boolean;
  isItemActive: (id: number | string | null) => boolean;
  isPlaying: boolean;
  pause: () => void;
  play: (item?: AudioPlayerItem<TData> | null) => Promise<void>;
  playbackRate: number;
  ref: RefObject<HTMLAudioElement | null>;
  seek: (time: number) => void;
  setActiveItem: (item: AudioPlayerItem<TData> | null) => Promise<void>;
  setPlaybackRate: (rate: number) => void;
}

const AudioPlayerContext = createContext<AudioPlayerApi<unknown> | null>(null);

export function useAudioPlayer<TData = unknown>(): AudioPlayerApi<TData> {
  const api = useContext(AudioPlayerContext) as AudioPlayerApi<TData> | null;
  if (!api) {
    throw new Error("useAudioPlayer cannot be called outside of AudioPlayerProvider");
  }
  return api;
}

const AudioPlayerTimeContext = createContext<number | null>(null);

export function useAudioPlayerTime(): number {
  const time = useContext(AudioPlayerTimeContext);
  if (time === null) {
    throw new Error("useAudioPlayerTime cannot be called outside of AudioPlayerProvider");
  }
  return time;
}

export function AudioPlayerProvider<TData = unknown>({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const itemRef = useRef<AudioPlayerItem<TData> | null>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);
  const [readyState, setReadyState] = useState(0);
  const [networkState, setNetworkState] = useState(0);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | undefined>(undefined);
  const [error, setError] = useState<MediaError | null>(null);
  const [activeItem, setActiveItemState] = useState<AudioPlayerItem<TData> | null>(null);
  const [paused, setPaused] = useState(true);
  const [playbackRate, setPlaybackRateState] = useState(1);

  const setActiveItem = useCallback(async (item: AudioPlayerItem<TData> | null) => {
    if (!audioRef.current) {
      return;
    }
    if (item?.id === itemRef.current?.id) {
      return;
    }
    itemRef.current = item;
    const currentRate = audioRef.current.playbackRate;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    if (item === null) {
      audioRef.current.removeAttribute("src");
    } else {
      audioRef.current.src = item.src;
    }
    audioRef.current.load();
    audioRef.current.playbackRate = currentRate;
  }, []);

  const play = useCallback(
    async (item?: AudioPlayerItem<TData> | null) => {
      if (!audioRef.current) {
        return;
      }
      if (playPromiseRef.current) {
        try {
          await playPromiseRef.current;
        } catch {
          playPromiseRef.current = null;
        }
      }
      if (item === undefined || item?.id === activeItem?.id) {
        const playPromise = audioRef.current.play();
        playPromiseRef.current = playPromise;
        return playPromise;
      }
      itemRef.current = item;
      const currentRate = audioRef.current.playbackRate;
      if (!audioRef.current.paused) {
        audioRef.current.pause();
      }
      audioRef.current.currentTime = 0;
      if (item === null) {
        audioRef.current.removeAttribute("src");
      } else {
        audioRef.current.src = item.src;
      }
      audioRef.current.load();
      audioRef.current.playbackRate = currentRate;
      const playPromise = audioRef.current.play();
      playPromiseRef.current = playPromise;
      return playPromise;
    },
    [activeItem],
  );

  const pause = useCallback(async () => {
    if (!audioRef.current) {
      return;
    }
    if (playPromiseRef.current) {
      try {
        await playPromiseRef.current;
      } catch {
        playPromiseRef.current = null;
      }
    }
    audioRef.current.pause();
    playPromiseRef.current = null;
  }, []);

  const seek = useCallback((nextTime: number) => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.currentTime = nextTime;
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    if (!audioRef.current) {
      return;
    }
    audioRef.current.playbackRate = rate;
    setPlaybackRateState(rate);
  }, []);

  const isItemActive = useCallback(
    (id: number | string | null) => activeItem?.id === id,
    [activeItem],
  );

  useAnimationFrame(() => {
    if (!audioRef.current) {
      return;
    }
    setActiveItemState(itemRef.current);
    setReadyState(audioRef.current.readyState);
    setNetworkState(audioRef.current.networkState);
    setTime(audioRef.current.currentTime);
    setDuration(audioRef.current.duration);
    setPaused(audioRef.current.paused);
    setError(audioRef.current.error);
    setPlaybackRateState(audioRef.current.playbackRate);
  });

  const isPlaying = !paused;
  const isBuffering =
    readyState < ReadyState.HAVE_FUTURE_DATA && networkState === NetworkState.NETWORK_LOADING;
  const api = useMemo<AudioPlayerApi<TData>>(
    () => ({
      activeItem,
      duration,
      error,
      isBuffering,
      isItemActive,
      isPlaying,
      pause,
      play,
      playbackRate,
      ref: audioRef,
      seek,
      setActiveItem,
      setPlaybackRate,
    }),
    [
      activeItem,
      duration,
      error,
      isBuffering,
      isItemActive,
      isPlaying,
      pause,
      play,
      playbackRate,
      seek,
      setActiveItem,
      setPlaybackRate,
    ],
  );

  return (
    <AudioPlayerContext.Provider value={api as AudioPlayerApi<unknown>}>
      <AudioPlayerTimeContext.Provider value={time}>
        <audio className="hidden" preload="metadata" ref={audioRef} />
        {children}
      </AudioPlayerTimeContext.Provider>
    </AudioPlayerContext.Provider>
  );
}

export function AudioPlayerProgress({
  className,
  ...otherProps
}: Omit<ComponentProps<"input">, "max" | "min" | "type" | "value">) {
  const player = useAudioPlayer();
  const time = useAudioPlayerTime();
  const wasPlayingRef = useRef(false);
  const duration = player.duration ?? 0;
  const disabled = duration === 0 || !Number.isFinite(duration) || Number.isNaN(duration);
  const progress = disabled ? 0 : Math.min(100, (time / duration) * 100);

  return (
    <div className={cn("group/player relative flex h-4 items-center", className)}>
      <div className="relative h-1 w-full grow overflow-hidden rounded-full bg-muted">
        <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: `${progress}%` }} />
      </div>
      <input
        {...otherProps}
        aria-label="播放进度"
        className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
        disabled={disabled}
        max={duration}
        min={0}
        onChange={(event) => {
          player.seek(Number(event.currentTarget.value));
          otherProps.onChange?.(event);
        }}
        onPointerDown={(event) => {
          wasPlayingRef.current = player.isPlaying;
          player.pause();
          otherProps.onPointerDown?.(event);
        }}
        onPointerUp={(event) => {
          if (wasPlayingRef.current) {
            void player.play();
          }
          otherProps.onPointerUp?.(event);
        }}
        step={0.25}
        type="range"
        value={disabled ? 0 : time}
      />
    </div>
  );
}

export function AudioPlayerTime({ className, ...otherProps }: HTMLProps<HTMLSpanElement>) {
  const time = useAudioPlayerTime();
  return (
    <span {...otherProps} className={cn("text-muted-foreground text-sm tabular-nums", className)}>
      {formatPlayerTime(time)}
    </span>
  );
}

export function AudioPlayerDuration({ className, ...otherProps }: HTMLProps<HTMLSpanElement>) {
  const player = useAudioPlayer();
  return (
    <span {...otherProps} className={cn("text-muted-foreground text-sm tabular-nums", className)}>
      {player.duration !== undefined && !Number.isNaN(player.duration)
        ? formatPlayerTime(player.duration)
        : "--:--"}
    </span>
  );
}

function PlayButton({
  className,
  loading,
  onClick,
  onPlayingChange,
  playing,
  ...otherProps
}: ComponentProps<typeof Button> & {
  loading?: boolean;
  onPlayingChange: (playing: boolean) => void;
  playing: boolean;
}) {
  return (
    <Button
      {...otherProps}
      aria-label={playing ? "暂停" : "播放"}
      className={cn("relative", className)}
      onClick={(event) => {
        onPlayingChange(!playing);
        onClick?.(event);
      }}
      type="button"
    >
      <Icon
        aria-hidden="true"
        className={cn(loading && "opacity-0")}
        icon={playing ? "ph:pause" : "ph:play"}
      />
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center rounded-[inherit] backdrop-blur-xs">
          <Icon aria-hidden="true" className="animate-spin" icon="ph:spinner-gap" />
          <span className="sr-only">正在加载</span>
        </span>
      ) : null}
    </Button>
  );
}

export function AudioPlayerButton<TData = unknown>({
  item,
  ...otherProps
}: ComponentProps<typeof Button> & {
  item?: AudioPlayerItem<TData>;
}) {
  const player = useAudioPlayer<TData>();
  if (!item) {
    return (
      <PlayButton
        {...otherProps}
        loading={player.isBuffering && player.isPlaying}
        onPlayingChange={(shouldPlay) => {
          if (shouldPlay) {
            void player.play();
            return;
          }
          player.pause();
        }}
        playing={player.isPlaying}
      />
    );
  }
  return (
    <PlayButton
      {...otherProps}
      loading={player.isItemActive(item.id) && player.isBuffering && player.isPlaying}
      onPlayingChange={(shouldPlay) => {
        if (shouldPlay) {
          void player.play(item);
          return;
        }
        player.pause();
      }}
      playing={player.isItemActive(item.id) && player.isPlaying}
    />
  );
}

const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 2] as const;

export function AudioPlayerSpeed({
  className,
  speeds = PLAYBACK_SPEEDS,
  ...props
}: ComponentProps<typeof Button> & {
  speeds?: readonly number[];
}) {
  const player = useAudioPlayer();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        {...props}
        aria-label="播放倍速"
        className={cn(
          "inline-flex h-8 min-w-10 items-center justify-center rounded-md px-2 font-medium text-muted-foreground text-xs tabular-nums hover:bg-accent hover:text-accent-foreground",
          className,
        )}
        type="button"
      >
        {player.playbackRate === 1 ? "1×" : `${player.playbackRate}×`}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-24">
        {speeds.map((speed) => (
          <DropdownMenuItem
            className="flex items-center justify-between"
            key={speed}
            onClick={() => player.setPlaybackRate(speed)}
          >
            <span>{speed === 1 ? "正常" : `${speed}×`}</span>
            {player.playbackRate === speed ? <Icon icon="ph:check" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type FrameCallback = (delta: number) => void;

function useAnimationFrame(callback: FrameCallback) {
  const requestRef = useRef<number | null>(null);
  const previousTimeRef = useRef<number | null>(null);
  const callbackRef = useRef<FrameCallback>(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    const animate = (nextTime: number) => {
      if (previousTimeRef.current !== null) {
        callbackRef.current(nextTime - previousTimeRef.current);
      }
      previousTimeRef.current = nextTime;
      requestRef.current = requestAnimationFrame(animate);
    };
    requestRef.current = requestAnimationFrame(animate);
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      previousTimeRef.current = null;
    };
  }, []);
}
