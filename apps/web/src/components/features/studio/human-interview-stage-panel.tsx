"use client";

/* oxlint-disable no-use-before-define -- helper components are kept below the container for readability */
import { IconPlus, IconUsers } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useReducer } from "react";
import { toast } from "sonner";
import type {
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@arc/shared/studio-pipeline-stages";
import {
  createHumanInterviewMeeting,
  endHumanInterviewMeeting,
  isApiError,
  issueHumanInterviewMeetingLinks,
  listHumanInterviewMeetings,
  listHumanInterviewRounds,
} from "@/lib/client/api";
import {
  humanInterviewKeys,
  invalidateHumanInterviewCandidateQueries,
  invalidateHumanInterviewWorkspaceQueries,
} from "@/lib/client/api/query-keys";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { authClient } from "@/lib/client/auth-client";
import { toAbsoluteUrl } from "@/lib/client/clipboard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  CancelRoundDialog,
  CompleteRoundDialog,
  ScheduleRoundDialog,
} from "./human-interview-stage-dialogs";
import { getCreatedMeetingFeishuFailure } from "./human-interview-feishu-error";
import { EndMeetingDialog, MeetingLinksDialog } from "./human-interview-stage-meetings";
import { RoundCard } from "./human-interview-stage-rounds";
import {
  buildHumanInterviewMeetingTitle,
  getHumanInterviewBusinessRoundNumbers,
  getHumanInterviewScheduleBlockReason,
} from "./human-interview-stage-utils";

interface PanelProps {
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
  scheduleOpen: boolean;
}

type DialogAction =
  | { open: boolean; type: "scheduleOpenChanged" }
  | { target: HumanInterviewRoundRecord | null; type: "cancelTargetChanged" }
  | { target: HumanInterviewRoundRecord | null; type: "completeTargetChanged" }
  | { target: HumanInterviewMeetingRecord | null; type: "endTargetChanged" }
  | { target: HumanInterviewMeetingRecord | null; type: "linksTargetChanged" };

const initialDialogState: DialogState = {
  cancelTarget: null,
  completeTarget: null,
  endTarget: null,
  linksTarget: null,
  scheduleOpen: false,
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
    case "scheduleOpenChanged": {
      return { ...state, scheduleOpen: action.open };
    }
    default: {
      return state;
    }
  }
}

export function HumanInterviewStagePanel({
  candidateId,
  candidateName,
  canCreate = true,
  canDelete = true,
  canUpdate = true,
  disabled,
}: PanelProps) {
  const slug = useWorkspaceSlug();
  const { data: session } = authClient.useSession();
  const queryClient = useQueryClient();
  const { data: rounds = [], isLoading } = useQuery({
    queryFn: () => listHumanInterviewRounds(slug, candidateId),
    queryKey: humanInterviewKeys.rounds(slug, candidateId),
  });
  const { data: meetings = [] } = useQuery({
    queryFn: () => listHumanInterviewMeetings(slug, { interviewRecordId: candidateId }),
    queryKey: humanInterviewKeys.meetings(slug, candidateId),
    refetchInterval: (query) =>
      query.state.data?.some(
        (meeting) => meeting.status === "scheduled" || meeting.status === "in_progress",
      )
        ? 10_000
        : false,
    refetchIntervalInBackground: false,
  });
  const passedRoundCount = rounds.filter(
    (round) => round.status === "completed" && round.outcome === "pass",
  ).length;
  const businessRoundNumbers = getHumanInterviewBusinessRoundNumbers(rounds);
  const scheduleBlockReason = getHumanInterviewScheduleBlockReason(rounds);

  function invalidateRounds() {
    void invalidateHumanInterviewCandidateQueries(queryClient, { candidateId, slug });
  }

  function invalidateRescheduledMeeting() {
    void invalidateHumanInterviewWorkspaceQueries(queryClient, { slug });
  }

  const [dialogState, dispatchDialog] = useReducer(dialogReducer, initialDialogState);
  const { cancelTarget, completeTarget, endTarget, linksTarget, scheduleOpen } = dialogState;
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
  const reviewMeetingMutation = useMutation({
    mutationFn: async (meetingId: string) => {
      const userId = session?.user.id;
      if (!userId) {
        throw new Error("登录状态已失效，请刷新后重试");
      }
      const links = await issueHumanInterviewMeetingLinks(slug, meetingId);
      const reviewerLink = links.interviewerLinks.find(
        (link) => link.userId === userId && link.role !== "observer",
      );
      if (!reviewerLink) {
        throw new Error("当前账号不是本轮面试官，无法提交会议评价");
      }
      return reviewerLink.url;
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "进入会议评价失败");
    },
    onSuccess: (url) => {
      window.location.assign(toAbsoluteUrl(url));
    },
  });

  let roundsContent: ReactNode;
  if (isLoading) {
    roundsContent = (
      <Card className="gap-0 rounded-lg py-0">
        <CardContent className="bg-muted/30 p-6 text-center text-muted-foreground text-sm">
          加载中…
        </CardContent>
      </Card>
    );
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
      <div className="space-y-3">
        {rounds.map((round) => {
          const meeting =
            meetings.find((item) =>
              item.rounds.some((meetingRound) => meetingRound.roundId === round.id),
            ) ?? null;
          return (
            <RoundCard
              canCreate={canCreate}
              canDelete={canDelete}
              canUpdate={canUpdate}
              disabled={disabled}
              key={round.id}
              meeting={meeting}
              onCancel={() => dispatchDialog({ target: round, type: "cancelTargetChanged" })}
              onComplete={() => dispatchDialog({ target: round, type: "completeTargetChanged" })}
              onCreateMeeting={() => createMeetingMutation.mutate(round)}
              onEndMeeting={(item) => dispatchDialog({ target: item, type: "endTargetChanged" })}
              onOpenLinks={(item) => dispatchDialog({ target: item, type: "linksTargetChanged" })}
              onRescheduled={invalidateRescheduledMeeting}
              onReview={(item) => reviewMeetingMutation.mutate(item.id)}
              round={round}
              roundNumber={businessRoundNumbers.get(round.id) ?? 2}
              slug={slug}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-sm">真人复面进度</h3>
        <p className="text-muted-foreground text-xs">
          管理 {candidateName} 的真人复面：安排时间 / 录入面试官 / 标记结果。
        </p>
      </div>

      {roundsContent}

      {disabled || !canCreate ? null : (
        <div className="w-full space-y-2">
          <Button
            disabled={scheduleBlockReason !== null}
            onClick={() => dispatchDialog({ open: true, type: "scheduleOpenChanged" })}
            size="lg"
            className="w-full"
          >
            <IconPlus className="size-4" />
            安排真人复面
          </Button>
          {scheduleBlockReason ? (
            <p className="text-center text-muted-foreground text-xs">{scheduleBlockReason}</p>
          ) : null}
        </div>
      )}

      <ScheduleRoundDialog
        candidateId={candidateId}
        candidateName={candidateName}
        passedRoundCount={passedRoundCount}
        onOpenChange={(open) => dispatchDialog({ open, type: "scheduleOpenChanged" })}
        onScheduled={invalidateRounds}
        open={scheduleOpen}
      />
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
