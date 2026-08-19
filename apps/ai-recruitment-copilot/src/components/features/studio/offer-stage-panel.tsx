"use client";

import { IconHeartHandshake, IconPlus } from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 阶段的详情面板内容：
//   - 顶部：候选人期望（薪资 / 现 base / 期望入职日）—— 可编辑，partial merge
//   - 下方：Offer 草稿版本时间线（version desc）
//   - 新建 Offer / 编辑 draft / 记录响应 / 撤回
//   - 候选人接受 Offer 时弹二次确认，请上层走「标记结案 hired」流程
//
// Offer-stage panel: candidate expectations inline form + offer draft
// timeline. Draft → sent → respond / cancel flows; on "accepted" we prompt
// the caller to launch the close flow.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { OfferDraftRecord } from "@arc/shared/studio-pipeline-stages";
import { listOfferDrafts } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CandidateExpectationsBlock, OfferCard } from "./offer-stage-cards";
import {
  AcceptedConfirmDialog,
  CreateOrEditOfferDialog,
  RespondOfferDialog,
} from "./offer-stage-dialogs";

interface PanelProps {
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  canCreate?: boolean;
  canDelete?: boolean;
  canUpdate?: boolean;
  disabled?: boolean;
  // 父级在「候选人接受 Offer」二次确认后，开「标记结案 + outcome=hired」dialog。
  // Parent opens the close dialog with outcome=hired after this fires.
  onRequestCloseAsHired?: () => void;
}

export function OfferStagePanel({
  candidateId,
  candidateEmail,
  candidateName,
  canCreate = true,
  canDelete = true,
  canUpdate = true,
  disabled,
  onRequestCloseAsHired,
}: PanelProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { data: drafts = [], isLoading } = useQuery({
    queryFn: () => listOfferDrafts(slug, candidateId),
    queryKey: ["offer-drafts", slug, candidateId],
  });

  function invalidateDrafts() {
    void queryClient.invalidateQueries({ queryKey: ["offer-drafts", slug, candidateId] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [respondTarget, setRespondTarget] = useState<OfferDraftRecord | null>(null);
  const [acceptedConfirm, setAcceptedConfirm] = useState<OfferDraftRecord | null>(null);

  function renderDraftsContent() {
    if (isLoading) {
      return (
        <Card className="gap-0 rounded-lg py-0">
          <CardContent className="bg-muted/30 p-6 text-center text-muted-foreground text-sm">
            加载中…
          </CardContent>
        </Card>
      );
    }

    if (drafts.length === 0) {
      let emptyDescription = "你可以查看 Offer 记录，但不能创建 Offer。";
      if (disabled) {
        emptyDescription = "已结案候选人不可创建 Offer。";
      } else if (canCreate) {
        emptyDescription = "点「创建 Offer」起草第一版。";
      }
      return (
        <Empty className="border-border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconHeartHandshake className="size-5" />
            </EmptyMedia>
            <EmptyTitle>尚未发出 Offer</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <div className="space-y-3">
        {drafts.map((draft) => (
          <OfferCard
            canDelete={canDelete}
            canUpdate={canUpdate}
            candidateId={candidateId}
            disabled={disabled}
            draft={draft}
            key={draft.id}
            onCancelled={invalidateDrafts}
            onRespond={() => setRespondTarget(draft)}
            onSaved={invalidateDrafts}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <CandidateExpectationsBlock candidateId={candidateId} disabled={disabled || !canUpdate} />

      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">Offer 版本</h3>
          <p className="text-muted-foreground text-xs">
            管理 {candidateName} 的 Offer；新版本会替换旧草稿或尚未结束的已发版本。
          </p>
        </div>
        {disabled || !canCreate ? null : (
          <Button onClick={() => setCreateOpen(true)} size="sm">
            <IconPlus className="size-4" />
            创建 Offer
          </Button>
        )}
      </div>

      {renderDraftsContent()}

      <CreateOrEditOfferDialog
        candidateEmail={candidateEmail}
        candidateId={candidateId}
        key={createOpen ? "create-open" : "create-closed"}
        mode="create"
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
          }
        }}
        onSaved={invalidateDrafts}
        open={createOpen}
      />
      <RespondOfferDialog
        candidateId={candidateId}
        draft={respondTarget}
        key={respondTarget?.id ?? "closed"}
        onAccepted={(accepted) => {
          setAcceptedConfirm(accepted);
        }}
        onOpenChange={(open) => !open && setRespondTarget(null)}
        onResponded={invalidateDrafts}
      />
      <AcceptedConfirmDialog
        draft={acceptedConfirm}
        onOpenChange={(open) => !open && setAcceptedConfirm(null)}
        onProceed={() => {
          setAcceptedConfirm(null);
          onRequestCloseAsHired?.();
        }}
      />
    </div>
  );
}

// ── 候选人期望（内联编辑）──
// Candidate expectations inline editor.
