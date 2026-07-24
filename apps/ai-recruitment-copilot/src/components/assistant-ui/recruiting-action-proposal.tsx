"use client";

import { makeAssistantToolUI } from "@assistant-ui/react";
import type { ToolApprovalResponse } from "@assistant-ui/react";
import { IconLoader2 } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CardFooter, CardHeader, CardPanel } from "@/components/ui/card";
import { JobDescriptionSelectField } from "@/components/features/studio/interviews/job-description-select-field";
import { confirmRecruitingAction } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { notifyConversationsChanged } from "@/components/features/chat/lib/chat-events";
import { RecruitingChatCard } from "./recruiting-chat-card";
import { useRecruitingCopilotContext } from "./recruiting-copilot-context";
import type {
  ProposalStatus,
  RecruitingActionConfirmation,
  RecruitingActionProposal,
  RecruitingActionProposalResult,
} from "./recruiting-copilot-context";

function ToolNotice({ children }: { children: string }) {
  return (
    <div className="aui-tool-notice rounded-2xl border bg-muted/40 px-3 py-2 text-muted-foreground text-sm">
      {children}
    </div>
  );
}

function statusLabel(status: ProposalStatus) {
  switch (status) {
    case "confirmed": {
      return "已确认";
    }
    case "failed": {
      return "确认失败";
    }
    case "ignored": {
      return "已忽略";
    }
    default: {
      return "待确认";
    }
  }
}

interface JobBindPayload {
  jobDescriptionId: string | null;
  poolItemId: string | null;
  resumeRecordId: string | null;
}

function readJobBindPayload(payload: Record<string, unknown>): JobBindPayload {
  const resumeRecordId =
    typeof payload.resumeRecordId === "string" && payload.resumeRecordId.length > 0
      ? payload.resumeRecordId
      : null;
  const rawPoolItemId =
    typeof payload.poolItemId === "string" && payload.poolItemId.length > 0
      ? payload.poolItemId
      : null;
  const poolItemId = rawPoolItemId?.startsWith("pool:")
    ? rawPoolItemId.slice("pool:".length)
    : rawPoolItemId;
  const jobDescriptionId =
    typeof payload.jobDescriptionId === "string" && payload.jobDescriptionId.length > 0
      ? payload.jobDescriptionId
      : null;
  return { jobDescriptionId, poolItemId, resumeRecordId };
}

function isJobBindProposal(type: RecruitingActionProposal["type"]) {
  return type === "bind_candidate_to_job" || type === "bind_pool_item_to_job";
}

function withConfirmedJobBindPayload(
  proposal: RecruitingActionProposal,
  jobDescriptionId: string | null,
  bindPayload: JobBindPayload | null,
): RecruitingActionProposal {
  if (proposal.type === "bind_candidate_to_job") {
    return {
      ...proposal,
      payload: {
        ...proposal.payload,
        jobDescriptionId,
        resumeRecordId: bindPayload?.resumeRecordId,
      },
    };
  }
  if (proposal.type === "bind_pool_item_to_job") {
    return {
      ...proposal,
      payload: {
        ...proposal.payload,
        jobDescriptionId,
        poolItemId: bindPayload?.poolItemId,
      },
    };
  }
  return proposal;
}

function missingBindSelectionMessage(
  proposal: RecruitingActionProposal,
  bindPayload: JobBindPayload | null,
  jobDescriptionId: string | null,
): string | null {
  if (
    proposal.type === "bind_candidate_to_job" &&
    !(bindPayload?.resumeRecordId && jobDescriptionId)
  ) {
    return "请先选择要绑定的岗位";
  }
  if (proposal.type === "bind_pool_item_to_job" && !(bindPayload?.poolItemId && jobDescriptionId)) {
    return "请先选择要绑定的岗位";
  }
  return null;
}

function resolveCardStatus(
  confirmation: RecruitingActionConfirmation | null | undefined,
  storedStatus: ProposalStatus | undefined,
  approvalApproved: boolean | undefined,
): ProposalStatus {
  if (confirmation?.status === "confirmed" || confirmation?.status === "ignored") {
    return confirmation.status;
  }
  if (approvalApproved === true) {
    return "confirmed";
  }
  if (approvalApproved === false) {
    return "ignored";
  }
  return storedStatus ?? "pending";
}

function buildConversationBindProposalId(
  kind: "resume_pool_item" | "resume_record",
  recordId: string,
) {
  return `conversation-bind:${kind}:${recordId}`;
}

function isRecruitingActionType(type: unknown): type is RecruitingActionProposal["type"] {
  return (
    type === "bind_candidate_to_job" ||
    type === "bind_pool_item_to_job" ||
    type === "advance_candidate_stage" ||
    type === "generate_interview_questions"
  );
}

function proposalFromToolArgs(args: unknown, toolCallId: string): RecruitingActionProposal | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return null;
  }
  const record = args as Record<string, unknown>;
  const title = typeof record.title === "string" ? record.title.trim() : "";
  const explanation = typeof record.explanation === "string" ? record.explanation.trim() : "";
  const { type } = record;
  const payload =
    record.payload && typeof record.payload === "object" && !Array.isArray(record.payload)
      ? (record.payload as Record<string, unknown>)
      : null;
  if (!(title && explanation && payload && isRecruitingActionType(type))) {
    return null;
  }
  let id = toolCallId;
  if (type === "bind_candidate_to_job" && typeof payload.resumeRecordId === "string") {
    id = buildConversationBindProposalId("resume_record", payload.resumeRecordId);
  } else if (type === "bind_pool_item_to_job" && typeof payload.poolItemId === "string") {
    const poolItemId = payload.poolItemId.startsWith("pool:")
      ? payload.poolItemId.slice("pool:".length)
      : payload.poolItemId;
    id = buildConversationBindProposalId("resume_pool_item", poolItemId);
  }
  return { explanation, id, payload, title, type };
}

function ActionProposalActions({
  canConfirm,
  confirmLabel,
  disabled,
  isSubmitting,
  onConfirm,
  onIgnore,
}: {
  canConfirm: boolean;
  confirmLabel: string;
  disabled: boolean;
  isSubmitting: boolean;
  onConfirm: () => void;
  onIgnore: () => void;
}) {
  return (
    <div className="flex w-full justify-end gap-2">
      <Button disabled={disabled} onClick={onIgnore} size="sm" type="button" variant="outline">
        忽略
      </Button>
      <Button disabled={disabled || !canConfirm} onClick={onConfirm} size="sm" type="button">
        {isSubmitting ? <IconLoader2 className="size-3.5 animate-spin" /> : null}
        {confirmLabel}
      </Button>
    </div>
  );
}

function RecruitingActionProposalCard({
  approvalApproved,
  awaitingApproval,
  confirmation,
  onRespondToApproval,
  proposal,
}: {
  approvalApproved?: boolean;
  awaitingApproval: boolean;
  confirmation?: RecruitingActionConfirmation | null;
  onRespondToApproval?: (response: ToolApprovalResponse) => void;
  proposal: RecruitingActionProposal;
}) {
  const slug = useWorkspaceSlug();
  const { conversationId, markProposal, proposalStatuses, upsertProposal } =
    useRecruitingCopilotContext();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localConfirmation, setLocalConfirmation] = useState<RecruitingActionConfirmation | null>(
    confirmation ?? null,
  );
  const effectiveConfirmation = localConfirmation ?? confirmation ?? null;
  const bindPayload = isJobBindProposal(proposal.type)
    ? readJobBindPayload(proposal.payload)
    : null;
  const [selectedJobDescriptionId, setSelectedJobDescriptionId] = useState(
    () => confirmation?.jobDescriptionId ?? bindPayload?.jobDescriptionId ?? "",
  );
  const currentStatus = resolveCardStatus(
    effectiveConfirmation,
    proposalStatuses[proposal.id],
    approvalApproved,
  );
  const isDone = currentStatus === "confirmed" || currentStatus === "ignored";
  const isConfirmed = currentStatus === "confirmed";
  const canInteract = awaitingApproval && !isDone;
  const showJobPicker = Boolean(bindPayload);
  const showActions = canInteract;
  const canConfirmBind =
    !isJobBindProposal(proposal.type) ||
    Boolean(selectedJobDescriptionId || bindPayload?.jobDescriptionId);
  const actionsDisabled = !conversationId || isSubmitting || !canInteract;

  useEffect(() => {
    if (confirmation) {
      setLocalConfirmation(confirmation);
    }
  }, [confirmation]);

  useEffect(() => {
    const confirmedJobId = effectiveConfirmation?.jobDescriptionId;
    if (confirmedJobId) {
      setSelectedJobDescriptionId(confirmedJobId);
    }
  }, [effectiveConfirmation?.jobDescriptionId]);

  useEffect(() => {
    upsertProposal(proposal);
    if (currentStatus === "confirmed" || currentStatus === "ignored") {
      markProposal(proposal.id, currentStatus);
    }
  }, [currentStatus, markProposal, proposal, upsertProposal]);

  const handleConfirm = async () => {
    if (!conversationId || isSubmitting || !canInteract) {
      return;
    }
    const jobDescriptionId = selectedJobDescriptionId || bindPayload?.jobDescriptionId || null;
    const missingMessage = missingBindSelectionMessage(proposal, bindPayload, jobDescriptionId);
    if (missingMessage) {
      toast.error(missingMessage);
      return;
    }
    setIsSubmitting(true);
    try {
      const nextProposal = withConfirmedJobBindPayload(proposal, jobDescriptionId, bindPayload);
      const result = await confirmRecruitingAction(slug, conversationId, nextProposal);
      if (result.status === "failed") {
        markProposal(proposal.id, "failed");
        toast.error(result.message);
        return;
      }
      const nextConfirmation = result.confirmation ?? {
        confirmedAt: new Date().toISOString(),
        ...(jobDescriptionId ? { jobDescriptionId } : {}),
        status: "confirmed" as const,
      };
      if (jobDescriptionId) {
        setSelectedJobDescriptionId(jobDescriptionId);
      }
      setLocalConfirmation(nextConfirmation);
      markProposal(proposal.id, "confirmed");
      notifyConversationsChanged();
      toast.success(result.message);
      onRespondToApproval?.({ approved: true });
    } catch (error) {
      markProposal(proposal.id, "failed");
      toast.error(error instanceof Error ? error.message : "确认动作失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleIgnore = async () => {
    if (!conversationId || isSubmitting || !canInteract) {
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await confirmRecruitingAction(slug, conversationId, proposal, {
        decision: "ignore",
      });
      if (result.status === "failed") {
        markProposal(proposal.id, "failed");
        toast.error(result.message);
        return;
      }
      const nextConfirmation = result.confirmation ?? {
        confirmedAt: new Date().toISOString(),
        status: "ignored" as const,
      };
      setLocalConfirmation(nextConfirmation);
      markProposal(proposal.id, "ignored");
      notifyConversationsChanged();
      onRespondToApproval?.({ approved: false, reason: "user_ignored" });
    } catch (error) {
      markProposal(proposal.id, "failed");
      toast.error(error instanceof Error ? error.message : "忽略动作失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <RecruitingChatCard className="aui-action-proposal rounded-xl" render={<article />}>
      <CardHeader className="gap-0 p-3 pb-0">
        <p className="text-muted-foreground text-xs">{statusLabel(currentStatus)}</p>
        <h3 className="mt-1 font-medium text-sm">{proposal.title}</h3>
      </CardHeader>
      <CardPanel className="p-3 pt-2">
        <p className="text-sm leading-6">{proposal.explanation}</p>
        {showJobPicker ? (
          <div className="mt-3">
            <JobDescriptionSelectField
              disabled={!canInteract || isSubmitting}
              label={isConfirmed ? "已关联在招岗位" : "关联在招岗位"}
              onChange={setSelectedJobDescriptionId}
              required={!isConfirmed}
              showDescription={false}
              size="sm"
              value={selectedJobDescriptionId}
            />
          </div>
        ) : null}
      </CardPanel>
      {showActions ? (
        <CardFooter className="p-3 pt-0">
          <ActionProposalActions
            canConfirm={canConfirmBind}
            confirmLabel={isJobBindProposal(proposal.type) ? "用于本对话分析" : "确认"}
            disabled={actionsDisabled}
            isSubmitting={isSubmitting}
            onConfirm={handleConfirm}
            onIgnore={handleIgnore}
          />
        </CardFooter>
      ) : null}
    </RecruitingChatCard>
  );
}

export const RecruitingActionProposalToolUI = makeAssistantToolUI<
  Record<string, unknown>,
  RecruitingActionProposalResult
>({
  display: "standalone",
  render: ({ approval, args, respondToApproval, result, status, toolCallId }) => {
    if (status.type === "running") {
      return <ToolNotice>正在生成动作建议...</ToolNotice>;
    }
    // Prefer original tool args so the card keeps its pre-confirm copy after execute returns.
    const proposal = proposalFromToolArgs(args, toolCallId) ?? result?.proposal;
    if (!proposal) {
      return null;
    }
    const awaitingApproval = Boolean(
      approval && approval.approved === undefined && approval.resolution === undefined,
    );
    return (
      <RecruitingActionProposalCard
        approvalApproved={approval?.approved}
        awaitingApproval={awaitingApproval || (!result && status.type === "requires-action")}
        confirmation={result?.confirmation}
        onRespondToApproval={respondToApproval}
        proposal={proposal}
      />
    );
  },
  toolName: "propose_recruiting_action",
});
