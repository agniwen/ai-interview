"use client";

import { RecruitingMaterialsPanel } from "./recruiting-materials-panel";
import { IconHeartHandshake, IconPlus } from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 接受后完成协商，后续继续背调与入职。

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import { listOfferDrafts } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CandidateExpectationsBlock, OfferCard } from "./offer-stage-cards";
import { CreateOrEditOfferDialog, RespondOfferDialog } from "./offer-stage-dialogs";

interface PanelProps {
  stage: ResumeLibraryDetail["pipelineStage"];
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  canCreate?: boolean;
  canDelete?: boolean;
  canUpdate?: boolean;
  disabled?: boolean;
}

export function OfferStagePanel({
  stage,
  candidateId,
  candidateEmail,
  candidateName,
  canCreate = true,
  canDelete = true,
  canUpdate = true,
  disabled,
}: PanelProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const offerDisabled = disabled || stage !== "offer";
  const showExpectations = stage !== "income_proof";
  const showSettings = showExpectations && stage !== "salary_negotiation";
  const {
    data: drafts = [],
    isLoading,
    isSuccess,
    isError,
  } = useQuery({
    enabled: showSettings,
    queryFn: () => listOfferDrafts(slug, candidateId),
    queryKey: ["offer-drafts", slug, candidateId],
  });

  function invalidateDrafts() {
    void queryClient.invalidateQueries({ queryKey: ["offer-drafts", slug, candidateId] });
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  }

  const [createOpen, setCreateOpen] = useState(false);
  const [respondTarget, setRespondTarget] = useState<OfferDraftRecord | null>(null);

  function renderDraftsContent() {
    if (isError) {
      return <p className="text-destructive text-sm">加载 Offer 失败，请刷新后重试。</p>;
    }
    if (isLoading) {
      return <Skeleton className="h-24 w-full" />;
    }

    if (drafts.length === 0) {
      let emptyDescription = "你可以查看 Offer 记录，但不能创建 Offer。";
      if (disabled) {
        emptyDescription = "已结束候选人不可创建 Offer。";
      } else if (canCreate && stage === "offer") {
        emptyDescription = "点「创建 Offer」填写 Offer 设置。";
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
        {drafts.slice(0, 1).map((draft) => (
          <OfferCard
            canDelete={canDelete}
            canUpdate={canUpdate}
            candidateId={candidateId}
            disabled={offerDisabled}
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
    <div className="flex min-w-0 flex-col gap-5">
      <RecruitingMaterialsPanel
        candidateId={candidateId}
        canCreate={canCreate}
        canDelete={canDelete}
        disabled={disabled || stage !== "income_proof"}
      />
      {showExpectations && (
        <CandidateExpectationsBlock
          candidateId={candidateId}
          disabled={disabled || !canUpdate || stage !== "salary_negotiation"}
        />
      )}

      {showSettings && (
        <Frame>
          <FrameHeader className="h-auto min-h-10 justify-between gap-3 py-2">
            <FrameTitle>Offer 设置</FrameTitle>
            {offerDisabled || !canCreate || !isSuccess || drafts.length > 0 ? null : (
              <Button onClick={() => setCreateOpen(true)} size="sm">
                <IconPlus className="size-4" />
                创建 Offer
              </Button>
            )}
          </FrameHeader>
          <FramePanel className="flex flex-col gap-4">
            <p className="text-muted-foreground text-xs">
              管理 {candidateName} 的 Offer，确认发送后不可删除。
            </p>
            {renderDraftsContent()}
          </FramePanel>
        </Frame>
      )}

      <CreateOrEditOfferDialog
        candidateEmail={candidateEmail}
        candidateId={candidateId}
        mode="create"
        onOpenChange={(open) => {
          if (!open) {
            setCreateOpen(false);
          }
        }}
        onSaved={invalidateDrafts}
        open={createOpen && !offerDisabled && canCreate}
      />
      <RespondOfferDialog
        candidateId={candidateId}
        draft={!offerDisabled && canUpdate ? respondTarget : null}
        onOpenChange={(open) => !open && setRespondTarget(null)}
        onResponded={invalidateDrafts}
      />
    </div>
  );
}

// ── 候选人期望（内联编辑）──
// Candidate expectations inline editor.
