"use client";

/**
 * 简历身份维度查重提示 overlay。
 * Identity-dedup overlay shown after a resume is parsed.
 *
 * 在创建面试 / 一键入库流程中，简历解析完成后若按姓名/邮箱/电话命中已有记录，
 * 调用方把当前 isBusy overlay 切换成本组件，让用户判断"是不是同一个人"。
 *
 * Used by both the create-interview dialog and the chat one-click import button.
 * After parse succeeds, if the dedup endpoint returns matches, the caller swaps
 * the in-progress overlay for this component so the user can decide.
 */

import { AlertTriangleIcon, ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import type { DedupMatchedField, DedupMatchRecord } from "@/lib/client/api";
import { studioInterviewStatusMeta } from "@arc/db-schema/studio-interviews";
import { formatDate } from "@arc/shared/utils/time";
import { StudioPersonDetailDialog } from "@/components/features/studio/studio-person-detail-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const FIELD_LABEL: Record<DedupMatchedField, string> = {
  email: "邮箱",
  name: "姓名",
  phone: "电话",
};

// 直接走共享 formatDate（dayjs 实现，`YY/MM/DD HH:mm`），整库统一一个格式。
// Delegate to the shared formatDate (dayjs-based `YY/MM/DD HH:mm`) for a single
// unified format across the app.
function formatCreatedAt(value: string) {
  return formatDate(value);
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
              依据简历中的姓名 / 邮箱 /
              电话匹配。请确认这些记录是否为同一候选人——你可以选择继续解析，或取消本次上传。
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
                      <Badge variant={statusMeta?.tone ?? "outline"}>
                        {statusMeta?.label ?? match.status}
                      </Badge>
                      {match.matchedFields.map((field) => (
                        <Badge key={field} variant="secondary">
                          {FIELD_LABEL[field]} 命中
                        </Badge>
                      ))}
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
              </div>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            取消上传
          </Button>
          <Button onClick={onContinue} type="button">
            继续解析
          </Button>
        </div>
      </div>

      <StudioPersonDetailDialog
        mode="interview"
        onOpenChange={setDetailOpen}
        open={detailOpen}
        recordId={detailRecordId}
      />
    </>
  );
}
