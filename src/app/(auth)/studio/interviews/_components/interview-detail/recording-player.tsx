"use client";

/**
 * 面试单轮录像回放组件.
 * 仅在用户点击"加载录像"时才请求预签名 URL, 避免列表打开就批量 sign 增加 S3 调用.
 *
 * Per-round recording playback. Defers fetching the presigned URL to the
 * moment the user explicitly opts in, so opening the dialog doesn't burn a
 * presign request per round.
 */

import { Loader2Icon, PlayIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchStudioInterviewRecordingUrl } from "@/lib/api";
import { ApiError } from "@/lib/api/errors";

interface RecordingPlayerProps {
  recordId: string;
  conversationId: string;
  status: "pending" | "active" | "completed" | "failed" | null;
  durationSecs: number | null;
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

export function RecordingPlayer({
  recordId,
  conversationId,
  status,
  durationSecs,
}: RecordingPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (status !== "completed") {
    return (
      <div className="rounded-2xl border border-border/60 bg-background p-4">
        <h4 className="font-medium text-sm">面试录像</h4>
        <p className="mt-2 text-muted-foreground text-sm">{statusLabel(status)}</p>
      </div>
    );
  }

  async function loadUrl() {
    setLoading(true);
    try {
      const res = await fetchStudioInterviewRecordingUrl(recordId, conversationId);
      setUrl(res.url);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "录像加载失败, 请稍后重试。";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  const durationText = formatDuration(durationSecs);

  return (
    <div className="rounded-2xl border border-border/60 bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-medium text-sm">
          面试录像
          {durationText ? (
            <span className="ml-2 text-muted-foreground text-xs">时长 {durationText}</span>
          ) : null}
        </h4>
        {!url && (
          <Button disabled={loading} onClick={loadUrl} size="sm" variant="outline">
            {loading ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <PlayIcon className="size-4" />
            )}
            <span className="ml-1">加载录像</span>
          </Button>
        )}
      </div>
      {url ? (
        // oxlint-disable-next-line jsx-a11y/media-has-caption -- 面试录像无字幕轨道可挂载；候选人音视频原始记录，不存在 captions 资源。
        <video
          className="mt-3 w-full rounded-xl border border-border/60"
          controls
          preload="metadata"
          src={url}
        />
      ) : (
        <p className="mt-2 text-muted-foreground text-sm">点击"加载录像"开始播放。</p>
      )}
    </div>
  );
}
