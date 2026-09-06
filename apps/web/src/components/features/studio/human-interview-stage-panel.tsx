"use client";

/* oxlint-disable no-use-before-define -- helper components are kept below the container for readability */
import { IconUsers } from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { findHumanInterviewRoundMeeting } from "@app/shared/human-interview-meeting-detail";
import type { ReactNode } from "react";
import { useReducer } from "react";
import { toast } from "sonner";
import type {
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@app/shared/studio-pipeline-stages";
import {
  createHumanInterviewMeeting,
  endHumanInterviewMeeting,
  isApiError,
} from "@/lib/client/api";
import {
  invalidateHumanInterviewCandidateQueries,
  invalidateHumanInterviewWorkspaceQueries,
} from "@/lib/client/api/query-keys";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  resolveHumanInterviewReviewRoundId,
  withoutHumanInterviewReviewSearch,
} from "./resumes/recruiter-resume-detail-search";
import { HumanInterviewReviewDialog } from "./human-interview-review-dialog";
import { Button } from "@/components/ui/button";
import { HumanInterviewStageSkeleton } from "./human-interview-stage-skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CancelRoundDialog, CompleteRoundDialog } from "./human-interview-stage-dialogs";
import { getCreatedMeetingFeishuFailure } from "./human-interview-feishu-error";
import { EndMeetingDialog, MeetingLinksDialog } from "./human-interview-stage-meetings";
import { ListLoadError } from "@/components/features/data-grid/list-load-error";
import { ScheduleHumanInterviewButton } from "./schedule-human-interview-button";
import { useHumanInterviewStageQueries } from "./use-human-interview-stage-queries";
import { RoundCard } from "./human-interview-stage-rounds";
import {
  buildHumanInterviewMeetingTitle,
  getHumanInterviewBusinessRoundNumbers,
} from "./human-interview-stage-utils";

interface PanelProps {
  targetStage?: "second_interview" | "final_interview";
  candidateId: string;
  candidateName: string;
  canCreate?: boolean;
  canDelete?: boolean;
  canUpdate?: boolean;
  // closed 状态时所有写按钮禁用（页面上层已隐藏，这里再兜一手）。
  // All writes disabled when candidate is closed (defense in depth).
  disabled?: boolean;
}

interface DialogState {
  cancelTarget: HumanInterviewRoundRecord | null;
  completeTarget: HumanInterviewRoundRecord | null;
  endTarget: HumanInterviewMeetingRecord | null;
  linksTarget: HumanInterviewMeetingRecord | null;
}

type DialogAction =
  | { target: HumanInterviewRoundRecord | null; type: "cancelTargetChanged" }
  | { target: HumanInterviewRoundRecord | null; type: "completeTargetChanged" }
  | { target: HumanInterviewMeetingRecord | null; type: "endTargetChanged" }
  | { target: HumanInterviewMeetingRecord | null; type: "linksTargetChanged" };

const initialDialogState: DialogState = {
  cancelTarget: null,
  completeTarget: null,
  endTarget: null,
  linksTarget: null,
};

function dialogReducer(state: DialogState, action: DialogAction): DialogState {
  switch (action.type) {
    case "cancelTargetChanged": {
      return { ...state, cancelTarget: action.target };
    }
    case "completeTargetChanged": {
      return { ...state, completeTarget: action.target };
    }
    case "endTargetChanged": {
      return { ...state, endTarget: action.target };
    }
    case "linksTargetChanged": {
      return { ...state, linksTarget: action.target };
    }
    default: {
      return state;
    }
  }
}

export function HumanInterviewStagePanel({
  targetStage = "second_interview",
  candidateId,
  candidateName,
  canCreate = true,
  canDelete = true,
  canUpdate = true,
  disabled,
}: PanelProps) {
  const canScheduleRounds = canCreate && !disabled;
  const slug = useWorkspaceSlug();
  const navigate = useNavigate();
  const reviewRoundId = useSearch({ select: resolveHumanInterviewReviewRoundId, strict: false });
  const queryClient = useQueryClient();
  const { rounds, meetings, roundsQuery, meetingsQuery, initialError, hasData } =
    useHumanInterviewStageQueries(slug, candidateId, true);
  const businessRoundNumbers = getHumanInterviewBusinessRoundNumbers(rounds);

  function invalidateRounds() {
    void invalidateHumanInterviewCandidateQueries(queryClient, { candidateId, slug });
  }

  function invalidateRescheduledMeeting() {
    void invalidateHumanInterviewWorkspaceQueries(queryClient, { slug });
  }

  const [dialogState, dispatchDialog] = useReducer(dialogReducer, initialDialogState);
  const { cancelTarget, completeTarget, endTarget, linksTarget } = dialogState;
  const endMeetingMutation = useMutation({
    mutationFn: (meetingId: string) => endHumanInterviewMeeting(slug, meetingId),
    onError: (e) => toast.error(e instanceof Error ? e.message : "结束会议失败"),
    onSuccess: () => {
      toast.success("会议已结束");
      dispatchDialog({ target: null, type: "endTargetChanged" });
      invalidateRounds();
    },
  });
  const createMeetingMutation = useMutation({
    mutationFn: async (round: HumanInterviewRoundRecord) => {
      try {
        await createHumanInterviewMeeting(slug, {
          notes: round.notes,
          roundIds: [round.id],
          scheduledAt: round.scheduledAt,
          title: buildHumanInterviewMeetingTitle(candidateName, round.label),
          validUntil: null,
        });
        return { feishuFailure: null };
      } catch (error) {
        const feishuFailure = isApiError(error) ? getCreatedMeetingFeishuFailure(error) : null;
        if (!feishuFailure) {
          throw error;
        }
        return { feishuFailure };
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "创建视频会议失败"),
    onSuccess: ({ feishuFailure }) => {
      if (feishuFailure) {
        toast.warning("视频会议已创建，飞书同步失败，可在会议链接中重试");
      } else {
        toast.success("已创建视频会议");
      }
      invalidateRounds();
    },
  });
  const roundGroups = [
    { label: "待处理", rounds: rounds.filter((round) => round.status === "pending") },
    {
      label: "历史面试",
      rounds: rounds.filter((round) => round.status !== "pending").toReversed(),
    },
  ].filter((group) => group.rounds.length > 0);
  let roundsContent: ReactNode;
  if (initialError) {
    roundsContent = (
      <ListLoadError
        error={initialError}
        onRetry={() => {
          void roundsQuery.refetch();
          void meetingsQuery.refetch();
        }}
      />
    );
  } else if (!hasData) {
    roundsContent = <HumanInterviewStageSkeleton />;
  } else if (rounds.length === 0) {
    let emptyDescription = "你可以查看真人复面记录，但不能创建复面。";
    if (disabled) {
      emptyDescription = "已结束候选人不可新增复面，请先重新激活。";
    } else if (canCreate) {
      emptyDescription = "点「安排真人复面」创建线上复面会议。";
    }
    roundsContent = (
      <Empty className="border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <IconUsers className="size-5" />
          </EmptyMedia>
          <EmptyTitle>尚未安排真人复面</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  } else {
    roundsContent = (
      <div className="flex flex-col gap-6">
        {roundGroups.map((group) => (
          <section className="flex flex-col gap-3" key={group.label} aria-label={group.label}>
            <h4 className="flex items-center gap-2 font-medium text-sm">
              {group.label}
              <span className="text-muted-foreground text-xs tabular-nums">
                {group.rounds.length}
              </span>
            </h4>
            {group.rounds.map((round) => {
              const meeting = findHumanInterviewRoundMeeting(meetings, round.id);
              return (
                <RoundCard
                  canCreate={canCreate}
                  canDelete={canDelete}
                  canUpdate={canUpdate}
                  disabled={disabled}
                  key={round.id}
                  meeting={meeting}
                  meetingDetailLink={
                    meeting?.status === "ended" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        nativeButton={false}
                        render={
                          <Link
                            to="/w/$slug/studio/resumes/overlay/$recordId/human-interviews/$roundId/meetings/$meetingId"
                            params={{
                              meetingId: meeting.id,
                              recordId: candidateId,
                              roundId: round.id,
                              slug,
                            }}
                            state={(previous) => ({
                              ...previous,
                              fromHumanInterviewCandidate: candidateId,
                            })}
                          />
                        }
                      >
                        面试详情
                      </Button>
                    ) : null
                  }
                  onCancel={() => dispatchDialog({ target: round, type: "cancelTargetChanged" })}
                  onComplete={() =>
                    dispatchDialog({ target: round, type: "completeTargetChanged" })
                  }
                  onCreateMeeting={() => createMeetingMutation.mutate(round)}
                  onEndMeeting={(item) =>
                    dispatchDialog({ target: item, type: "endTargetChanged" })
                  }
                  onOpenLinks={(item) =>
                    dispatchDialog({ target: item, type: "linksTargetChanged" })
                  }
                  onRescheduled={invalidateRescheduledMeeting}
                  onReview={() =>
                    navigate({
                      replace: true,
                      resetScroll: false,
                      search: (previous) => ({
                        ...previous,
                        reviewRoundId: round.id,
                        tab: "human-interview",
                      }),
                      to: ".",
                    })
                  }
                  round={round}
                  roundNumber={businessRoundNumbers.get(round.id) ?? 2}
                  slug={slug}
                />
              );
            })}
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="font-medium text-sm">真人复面进度</h3>
            <p className="text-muted-foreground text-xs">查看面试安排、轮次结果与面试评价。</p>
          </div>
          {canScheduleRounds ? (
            <ScheduleHumanInterviewButton
              candidateId={candidateId}
              candidateName={candidateName}
              targetStage={targetStage}
            />
          ) : null}
        </div>
      </div>

      {roundsContent}

      {reviewRoundId ? (
        <HumanInterviewReviewDialog
          key={`${candidateId}:${reviewRoundId}`}
          slug={slug}
          candidateId={candidateId}
          candidateName={candidateName}
          roundId={reviewRoundId}
          roundLabel={rounds.find((round) => round.id === reviewRoundId)?.label}
          onSaved={invalidateRounds}
          onClose={() =>
            navigate({
              replace: true,
              resetScroll: false,
              search: withoutHumanInterviewReviewSearch,
              to: ".",
            })
          }
        />
      ) : null}
      <CompleteRoundDialog
        candidateId={candidateId}
        onCompleted={invalidateRounds}
        onOpenChange={(open) =>
          !open && dispatchDialog({ target: null, type: "completeTargetChanged" })
        }
        round={completeTarget}
      />
      <CancelRoundDialog
        candidateId={candidateId}
        onCancelled={invalidateRounds}
        onOpenChange={(open) =>
          !open && dispatchDialog({ target: null, type: "cancelTargetChanged" })
        }
        round={cancelTarget}
      />
      <MeetingLinksDialog
        meeting={linksTarget}
        onOpenChange={(open) =>
          !open && dispatchDialog({ target: null, type: "linksTargetChanged" })
        }
      />
      <EndMeetingDialog
        isPending={endMeetingMutation.isPending}
        meeting={endTarget}
        onConfirm={(meeting) => endMeetingMutation.mutateAsync(meeting.id)}
        onOpenChange={(open) => !open && dispatchDialog({ target: null, type: "endTargetChanged" })}
      />
    </div>
  );
}

// 单轮卡片：展示该轮信息 + 行动按钮（pending 才有）。
// Single round card; action buttons appear only when status='pending'.
