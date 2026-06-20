"use client";

/**
 * 简历疑似重复风险提示 overlay。
 * Resume duplicate-risk overlay shown after a resume is parsed.
 *
 * 在创建面试 / 一键入库流程中，简历解析完成后若命中语义相似记录，
 * 调用方把当前 isBusy overlay 切换成本组件，让用户判断是否继续创建。
 *
 * Used by both the create-interview dialog and the chat one-click import button.
 * After parse succeeds, if the dedup endpoint returns matches, the caller swaps
 * the in-progress overlay for this component so the user can decide.
 */

import { AlertTriangleIcon, ExternalLinkIcon } from "@/components/icons/hugeicons";
import { useState } from "react";
import type { DedupMatchRecord } from "@/lib/client/api";
import { studioInterviewStatusMeta } from "@arc/db-schema/studio-interviews";
import { formatDate } from "@arc/shared/utils/time";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const LEVEL_META: Record<
  NonNullable<DedupMatchRecord["level"]>,
  { label: string; tone: string }
> = {
  high: { label: "高度疑似重复", tone: "border-red-200 bg-red-50 text-red-700" },
  low: { label: "低风险", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  medium: { label: "可能重复", tone: "border-amber-200 bg-amber-50 text-amber-700" },
};

// 直接走共享 formatDate（dayjs 实现，`YY/MM/DD HH:mm`），整库统一一个格式。
// Delegate to the shared formatDate (dayjs-based `YY/MM/DD HH:mm`) for a single
// unified format across the app.
function formatCreatedAt(value: string) {
  return formatDate(value);
}

function formatSimilarity(value: number | undefined): string | null {
  if (typeof value !== "number") {
    return null;
  }
  return `${Math.round(value * 100)}%`;
}

function similarityEvidence(match: DedupMatchRecord): { label: string; value: string }[] {
  return [
    { label: "工作/项目", value: formatSimilarity(match.similarity?.workProject) },
    { label: "整体画像", value: formatSimilarity(match.similarity?.resumeOverview) },
    { label: "技能岗位", value: formatSimilarity(match.similarity?.skillRole) },
  ].filter((item): item is { label: string; value: string } => Boolean(item.value));
}

interface ResumeDedupOverlayProps {
  matches: DedupMatchRecord[];
  onContinue: () => void;
  onCancel: () => void;
}

export function ResumeDedupOverlay({ matches, onContinue, onCancel }: ResumeDedupOverlayProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailRecordId, setDetailRecordId] = useState<string | null>(null);

  function openDetail(id: string) {
    setDetailRecordId(id);
    setDetailOpen(true);
  }

  return (
    <>
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200/70 bg-amber-50/70 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangleIcon className="mt-0.5 size-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-medium text-sm">检测到 {matches.length} 条疑似重复的候选人记录</p>
            <p className="text-xs leading-normal opacity-80">
              系统会基于工作经历、项目经历、技能和岗位画像的语义相似度判断风险。
              请根据判断依据确认是否为同一候选人，再决定查看已有记录或继续创建。
            </p>
          </div>
        </div>

        <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
          {matches.map((match) => {
            const statusMeta = studioInterviewStatusMeta[match.status];
            return (
              <div
                className="rounded-xl border border-border/70 bg-background/95 p-4 shadow-sm"
                key={match.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm">{match.candidateName}</span>
                      {match.level ? (
                        <span
                          className={`rounded-md border px-1.5 py-0.5 font-medium text-[11px] ${LEVEL_META[match.level].tone}`}
                        >
                          {LEVEL_META[match.level].label}
                          {typeof match.score === "number" ? ` ${match.score}%` : ""}
                        </span>
                      ) : null}
                      <Badge variant={statusMeta?.tone ?? "outline"}>
                        {statusMeta?.label ?? match.status}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {match.targetRole ?? "未填目标岗位"}
                      {match.jobDescriptionName ? ` · ${match.jobDescriptionName}` : ""}
                    </p>
                  </div>
                  <Button
                    onClick={() => openDetail(match.id)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <ExternalLinkIcon className="size-3.5" />
                    查看
                  </Button>
                </div>
                <div className="mt-3 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">邮箱</span>
                    <span className="break-all">{match.candidateEmail ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">电话</span>
                    <span className="break-all">{match.candidatePhone ?? "—"}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-muted-foreground">创建时间</span>
                    <span>{formatCreatedAt(match.createdAt)}</span>
                  </div>
                </div>
                {match.semanticReasons && match.semanticReasons.length > 0 ? (
                  <div className="mt-3 space-y-1.5">
                    <div className="font-medium text-muted-foreground text-xs">判断依据</div>
                    <div className="flex flex-wrap gap-1.5">
                      {match.semanticReasons.map((reason) => (
                        <Badge key={reason} variant="secondary">
                          {reason}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null}
                {similarityEvidence(match).length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {similarityEvidence(match).map((item) => (
                      <Badge key={item.label} variant="outline">
                        {item.label}相似度 {item.value}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {match.conflictingSignals && match.conflictingSignals.length > 0 ? (
                  <div className="mt-2 text-muted-foreground text-xs">
                    不一致信号：{match.conflictingSignals.join("、")}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            取消上传
          </Button>
          <Button onClick={onContinue} type="button">
            仍然继续
          </Button>
        </div>
      </div>

      <StudioPersonDetailDialog
        mode="resume"
        onOpenChange={setDetailOpen}
        open={detailOpen}
        recordId={detailRecordId}
      />
    </>
  );
}
