import { IconFileText, IconLoader2, IconRefresh } from "@tabler/icons-react";
import {
  INITIAL_INTERVIEW_STATUS_LABELS,
  isInitialInterviewProcessing,
} from "@app/shared/human-initial-interview";
import type { HumanInitialInterviewSummary } from "@app/shared/human-initial-interview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";

export function HumanInitialInterviewCard({
  record,
  canGenerate,
  canDelete,
  pending,
  effective,
  documentUrl,
  onRegenerate,
  onResume,
  onDelete,
}: {
  record: HumanInitialInterviewSummary;
  canGenerate: boolean;
  canDelete: boolean;
  pending: boolean;
  effective: boolean;
  documentUrl: string | null;
  onRegenerate: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const version = record.latestVersion;
  const processing = isInitialInterviewProcessing(version.status);
  const availableUrl = version.documentUrl ?? documentUrl;
  return (
    <Frame data-testid="human-initial-interview-card">
      <FrameHeader className="h-auto min-h-8 py-1">
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FrameTitle>人工初面</FrameTitle>
            <Badge variant="outline">HR 沟通录音</Badge>
          </div>
          <div className="flex items-center gap-2">
            {effective ? <Badge variant="outline">流程依据</Badge> : null}
            <Badge variant={version.status === "ready" ? "success" : "secondary"}>
              {processing ? <IconLoader2 className="size-3 animate-spin" /> : null}
              {INITIAL_INTERVIEW_STATUS_LABELS[version.status]}
            </Badge>
          </div>
        </div>
      </FrameHeader>
      <FramePanel className="flex flex-col gap-2">
        <p className="truncate text-sm font-medium" title={record.title}>
          {record.title}
        </p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground text-xs">
          <span>{new Date(record.recordedAt).toLocaleString("zh-CN")}</span>
          <span>{Math.max(1, Math.round(record.durationMs / 60_000))} 分钟</span>
          <span>评价版本 {version.version}</span>
        </div>
        <p className="text-muted-foreground text-xs">
          录音与资料已独立保存。评价用于 HR 决策，不会自动推进招聘流程。
        </p>
        {version.error ? (
          <p role="alert" className="text-destructive text-sm">
            {version.error}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            {availableUrl ? (
              <Button
                nativeButton={false}
                render={
                  <a aria-label="打开评价表" href={availableUrl} target="_blank" rel="noreferrer" />
                }
                size="sm"
                variant="outline"
              >
                <IconFileText className="size-3.5" />
                {version.status === "ready" ? "打开评价表" : "现有评价表"}
              </Button>
            ) : null}
            {canGenerate && version.status === "ready" ? (
              <Button disabled={pending} onClick={onRegenerate} size="sm" variant="outline">
                <IconRefresh className="size-3.5" />
                重新生成
              </Button>
            ) : null}
            {canGenerate && version.status === "failed" ? (
              <Button disabled={pending} onClick={onResume} size="sm">
                重试
              </Button>
            ) : null}
            {canGenerate && version.status === "needs_speakers" ? (
              <Button disabled={pending} onClick={onResume} size="sm">
                重新生成
              </Button>
            ) : null}
          </div>
          {canDelete ? (
            <Button disabled={pending} onClick={onDelete} size="sm" variant="destructive">
              删除
            </Button>
          ) : null}
        </div>
      </FramePanel>
    </Frame>
  );
}
