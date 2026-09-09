"use client";

import { RecruitingMaterialsPanel } from "./recruiting-materials-panel";
import { IconCheck, IconHeartHandshake, IconPlus } from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// Offer 接受后完成协商，后续继续背调与入职。

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { RecruitingNodeStateRecord, ResumeLibraryDetail } from "@app/shared/studio-resumes";
import type { OfferDraftRecord } from "@app/shared/studio-pipeline-stages";
import { listOfferDrafts } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@app/shared/utils";

const offerNegotiationSteps = [
  { label: "流水提供", stage: "income_proof" },
  { label: "谈薪", stage: "salary_negotiation" },
  { label: "发 Offer", stage: "offer" },
  { label: "背调", stage: "background_check" },
] as const;

type OfferNegotiationStage = (typeof offerNegotiationSteps)[number]["stage"];

const offerStageTasks = {
  background_check: "完成候选人背景调查并确认结果，通过后进入入职办理。",
  income_proof:
    "收集并核验候选人的薪资证明。上传材料后点击“确认流水审核结果”；未提供材料时，请在审核说明中记录原因。",
  offer: "创建并发送 Offer，待候选人接受后可进入背调。",
  salary_negotiation: "记录候选人期望并完成薪资沟通，确认结果后可进入发 Offer。",
} satisfies Record<OfferNegotiationStage, string>;

function OfferNegotiationProgress({
  disabled,
  nodeStates,
  stage,
}: {
  disabled?: boolean;
  nodeStates: RecruitingNodeStateRecord[];
  stage: ResumeLibraryDetail["pipelineStage"];
}) {
  const currentIndex = offerNegotiationSteps.findIndex((step) => step.stage === stage);
  if (currentIndex === -1) {
    return null;
  }
  const currentStep = offerNegotiationSteps[currentIndex];

  return (
    <section aria-label="Offer 协商进度" className="rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium text-sm">Offer 协商进度</h2>
          <p className="mt-1 text-muted-foreground text-xs">第 {currentIndex + 1}/4 步</p>
        </div>
        <Badge variant="outline">当前：{currentStep.label}</Badge>
      </div>
      <ol aria-label="Offer 协商子阶段" className="mt-4 grid grid-cols-4 gap-2">
        {offerNegotiationSteps.map((step, index) => {
          const isCurrent = index === currentIndex;
          const nodeState = nodeStates.find((state) => state.node === step.stage);
          const isDone = nodeState?.status === "completed" && nodeState.result === "pass";
          return (
            <li aria-current={isCurrent ? "step" : undefined} className="min-w-0" key={step.stage}>
              <div className="flex items-center">
                <span
                  className={cn(
                    "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full border bg-background font-medium text-[11px]",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    isDone && "border-primary/40 bg-primary/10 text-primary",
                  )}
                >
                  {isDone ? <IconCheck className="size-3.5" /> : index + 1}
                </span>
                {index < offerNegotiationSteps.length - 1 ? (
                  <span className={cn("h-px flex-1 bg-border", isDone && "bg-primary/35")} />
                ) : null}
              </div>
              <p
                className={cn(
                  "mt-1.5 truncate text-muted-foreground text-xs",
                  isCurrent && "font-medium text-foreground",
                )}
              >
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <span className="font-medium">{disabled ? "流程状态：" : "当前阶段："}</span>
        {disabled ? "招聘流程已结束，以下内容仅作历史留存。" : offerStageTasks[currentStep.stage]}
      </p>
    </section>
  );
}

interface PanelProps {
  agreedBaseSalary?: number | null;
  stage: ResumeLibraryDetail["pipelineStage"];
  candidateId: string;
  candidateName: string;
  candidateEmail: string | null;
  canCreate?: boolean;
  canDelete?: boolean;
  canUpdate?: boolean;
  disabled?: boolean;
  nodeStates: RecruitingNodeStateRecord[];
}

export function OfferStagePanel({
  agreedBaseSalary,
  stage,
  candidateId,
  candidateEmail,
  candidateName,
  canCreate = true,
  canDelete = true,
  canUpdate = true,
  disabled,
  nodeStates,
}: PanelProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const offerDisabled = disabled || stage !== "offer";
  const showExpectations = stage !== "income_proof";
  const showSettings = showExpectations && stage !== "salary_negotiation";
  const incomeProofReview = nodeStates.find((node) => node.node === "income_proof");
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
        emptyDescription = "点「创建 Offer」填写 Offer 内容。";
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
      <OfferNegotiationProgress disabled={disabled} nodeStates={nodeStates} stage={stage} />
      <RecruitingMaterialsPanel
        candidateId={candidateId}
        canCreate={canCreate}
        canDelete={canDelete}
        disabled={disabled || stage !== "income_proof"}
        review={incomeProofReview}
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
            <FrameTitle>Offer 内容</FrameTitle>
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
        initialBaseSalary={agreedBaseSalary}
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
