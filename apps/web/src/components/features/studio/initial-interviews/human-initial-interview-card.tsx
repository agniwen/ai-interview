import {
  IconFileText,
  IconHeadphones,
  IconLoader2,
  IconPhone,
  IconRefresh,
} from "@tabler/icons-react";
import {
  INITIAL_INTERVIEW_STATUS_LABELS,
  isInitialInterviewProcessing,
} from "@app/shared/human-initial-interview";
import type { HumanInitialInterviewSummary } from "@app/shared/human-initial-interview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardFooter, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";

export function HumanInitialInterviewCard({
  record,
  canGenerate,
  canAdvance,
  pending,
  effective,
  documentUrl,
  onMaterials,
  onRegenerate,
  onResume,
  onAdvance,
}: {
  record: HumanInitialInterviewSummary;
  canGenerate: boolean;
  canAdvance: boolean;
  pending: boolean;
  effective: boolean;
  documentUrl: string | null;
  onMaterials: () => void;
  onRegenerate: () => void;
  onResume: () => void;
  onAdvance: () => void;
}) {
  const version = record.latestVersion;
  const processing = isInitialInterviewProcessing(version.status);
  const availableUrl = version.documentUrl ?? documentUrl;
  return (
    <Card data-testid="human-initial-interview-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <IconPhone className="size-4 text-muted-foreground" />
            <CardTitle>人工初面</CardTitle>
            <Badge variant="outline">HR 沟通录音</Badge>
          </div>
          <div className="flex items-center gap-2">
            {effective ? <Badge variant="secondary">流程依据</Badge> : null}
            <Badge variant={version.status === "ready" ? "success" : "secondary"}>
              {processing ? <IconLoader2 className="size-3 animate-spin" /> : null}
              {INITIAL_INTERVIEW_STATUS_LABELS[version.status]}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardPanel className="flex flex-col gap-2">
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
      </CardPanel>
      <CardFooter className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={onMaterials} size="sm" variant="outline">
          <IconHeadphones className="size-3.5" />
          资料快照{record.versionCount > 1 ? ` · ${record.versionCount} 个版本` : ""}
        </Button>
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
            <Button disabled={pending} onClick={onRegenerate} size="sm" variant="ghost">
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
            <Button disabled={pending} onClick={onMaterials} size="sm">
              确认说话人
            </Button>
          ) : null}
          {canAdvance && version.status === "ready" ? (
            <Button disabled={pending} onClick={onAdvance} size="sm">
              进入真人复面
            </Button>
          ) : null}
        </div>
      </CardFooter>
    </Card>
  );
}
