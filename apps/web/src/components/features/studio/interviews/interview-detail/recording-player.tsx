"use client";

import { IconLoader2, IconPlayerPlay, IconVideo } from "@tabler/icons-react";
/**
 * 面试单轮录像回放组件.
 * 仅在用户点击"加载录像"时才请求预签名 URL, 避免列表打开就批量 sign 增加 S3 调用.
 *
 * Per-round recording playback. Defers fetching the presigned URL to the
 * moment the user explicitly opts in, so opening the dialog doesn't burn a
 * presign request per round.
 */

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  fetchPublicInterviewRecordingUrl,
  fetchStudioInterviewRecordingUrl,
} from "@/lib/client/api";
import { ApiError } from "@/lib/client/api/errors";
import { runAsyncAction } from "@/lib/client/async-control";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";
import type { InterviewRecordingStatus } from "@app/db-schema/db-enums";
import { ResultSection } from "../../interview-result/result-section";
import { useRecordingPlaybackStore } from "./recording-playback";

interface RecordingPlayerProps {
  recordId: string;
  conversationId: string;
  status: InterviewRecordingStatus | null;
  durationSecs: number | null;
  seekToSecs?: number | null;
  /**
   * "authed"：走 /api/w/:slug/studio 路径（默认）。
   * "public"：走 /api/public 路径，无需 slug，用于 /r/[roundId] 等公开访问入口。
   *
   * "authed" routes through /api/w/:slug/studio (default).
   * "public" hits /api/public, slug-less, used by public-access routes.
   */
  accessMode?: "authed" | "public";
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0) {
    return "";
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function statusLabel(status: RecordingPlayerProps["status"]): string {
  switch (status) {
    case "pending":
    case "active": {
      return "录像生成中, 稍后再来查看。";
    }
    case "failed": {
      return "录像生成失败。";
    }
    default: {
      return "本轮未生成录像。";
    }
  }
}

/**
 * 元数据未就绪时设置 currentTime 可能被忽略，因此等 loadedmetadata 后再跳转。
 * Setting currentTime before metadata loads can be dropped, so wait for it.
 */
function seekAndPlay(video: HTMLVideoElement, secs: number) {
  const apply = async () => {
    video.currentTime = secs;
    try {
      await video.play();
    } catch {
      // 浏览器拒绝自动播放时保留跳转位置，由用户手动播放。
      // Autoplay may be blocked; keep the position and let the user press play.
    }
  };
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    void apply();
    return;
  }
  video.addEventListener(
    "loadedmetadata",
    () => {
      void apply();
    },
    { once: true },
  );
}

export function RecordingPlayer({
  recordId,
  conversationId,
  status,
  durationSecs,
  seekToSecs,
  accessMode = "authed",
}: RecordingPlayerProps) {
  const slug = useOptionalWorkspaceSlug();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // 录像地址就绪前收到的跳转（来自对话时间戳），加载完成后再执行并自动播放。
  // A seek requested before the URL loaded; applied (and played) once it is ready.
  const pendingSeekRef = useRef<number | null>(null);
  const playbackStore = useRecordingPlaybackStore();
  const isCompleted = status === "completed";

  async function loadUrl() {
    setLoading(true);
    await runAsyncAction({
      cleanup: () => setLoading(false),
      onError: (error) => {
        pendingSeekRef.current = null;
        const message = error instanceof ApiError ? error.message : "录像加载失败, 请稍后重试。";
        toast.error(message);
      },
      operation: async () => {
        const res =
          accessMode === "public"
            ? await fetchPublicInterviewRecordingUrl(recordId, conversationId)
            : await fetchStudioInterviewRecordingUrl(slug ?? "", recordId, conversationId);
        setUrl(res.url);
      },
    });
  }

  const handleSeekRequest = useEffectEvent((secs: number) => {
    const video = videoRef.current;
    if (!url || !video) {
      pendingSeekRef.current = secs;
      if (!loading) {
        void loadUrl();
      }
      return;
    }
    seekAndPlay(video, secs);
  });

  // 声明录像可播放，并订阅对话时间戳发起的跳转请求。
  // Announce the recording as playable and subscribe to transcript seek requests.
  useEffect(() => {
    if (!playbackStore || !isCompleted) {
      return;
    }
    playbackStore.setAvailable(true);
    let handledSeekId = playbackStore.getState().seekRequest?.id ?? null;
    const unsubscribe = playbackStore.subscribe(() => {
      const request = playbackStore.getState().seekRequest;
      if (request && request.id !== handledSeekId) {
        handledSeekId = request.id;
        handleSeekRequest(request.secs);
      }
    });
    return () => {
      unsubscribe();
      playbackStore.setAvailable(false);
    };
  }, [isCompleted, playbackStore]);

  useEffect(() => {
    if (seekToSecs === null || seekToSecs === undefined || !videoRef.current) {
      return;
    }
    videoRef.current.currentTime = seekToSecs;
  }, [seekToSecs, url]);

  useEffect(() => {
    const pendingSecs = pendingSeekRef.current;
    if (!url || pendingSecs === null || !videoRef.current) {
      return;
    }
    pendingSeekRef.current = null;
    seekAndPlay(videoRef.current, pendingSecs);
  }, [url]);

  if (!isCompleted) {
    return (
      <ResultSection icon={IconVideo} title="面试录像">
        <p className="text-muted-foreground text-sm">{statusLabel(status)}</p>
      </ResultSection>
    );
  }

  const reportProgress = (event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    playbackStore?.setProgress({ currentTimeSecs: video.currentTime, playing: !video.paused });
  };

  const durationText = formatDuration(durationSecs);

  return (
    <ResultSection
      action={
        url ? null : (
          <Button disabled={loading} onClick={loadUrl} size="xs" variant="outline">
            {loading ? <IconLoader2 className="animate-spin" /> : <IconPlayerPlay />}
            加载录像
          </Button>
        )
      }
      meta={
        durationText ? (
          <span className="text-muted-foreground text-xs">时长 {durationText}</span>
        ) : null
      }
      icon={IconVideo}
      title="面试录像"
    >
      {url ? (
        // oxlint-disable-next-line jsx-a11y/media-has-caption -- 面试录像无字幕轨道可挂载；候选人音视频原始记录，不存在 captions 资源。
        <video
          aria-label="面试录像"
          className="max-h-64 w-full rounded-xl border border-border bg-black object-contain"
          controls
          onPause={reportProgress}
          onPlay={reportProgress}
          onSeeked={reportProgress}
          onTimeUpdate={reportProgress}
          preload="metadata"
          ref={videoRef}
          src={url}
        />
      ) : (
        <div className="flex aspect-video max-h-64 w-full items-center justify-center rounded-xl bg-muted/50 px-6 text-center text-muted-foreground text-sm">
          点击"加载录像"或对话记录里的时间戳开始播放。
        </div>
      )}
    </ResultSection>
  );
}
