"use client";

import { IconHeartHandshake, IconPlus } from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 接受后完成协商，后续继续背调与入职。

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
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
import { CreateOrEditOfferDialog, RespondOfferDialog } from "./offer-stage-dialogs";

interface PanelProps {
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  canCreate?: boolean;
  canDelete?: boolean;
  canUpdate?: boolean;
  disabled?: boolean;
}

export function OfferStagePanel({
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
        emptyDescription = "已结束候选人不可创建 Offer。";
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
        onOpenChange={(open) => !open && setRespondTarget(null)}
        onResponded={invalidateDrafts}
      />
    </div>
  );
}

// ── 候选人期望（内联编辑）──
// Candidate expectations inline editor.
