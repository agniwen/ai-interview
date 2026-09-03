"use client";
/* oxlint-disable no-use-before-define -- helper components follow the public card */

import {
  IconBan,
  IconCheck,
  IconChecklist,
  IconCircleCheck,
  IconCopy,
  IconLoader2,
  IconPencil,
  IconPlayerStop,
  IconUsers,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { FormEvent, ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { humanInterviewFormatMeta } from "@app/db-schema/studio-interviews";
import type {
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@app/shared/studio-pipeline-stages";
import { RoundEvaluation } from "./human-interview-evaluation-summary";
import { dateTimeLocalInputToISOString } from "@/lib/client/datetime-local";
import {
  isApiError,
  issueHumanInterviewMeetingLinks,
  patchHumanInterviewRound,
  updateHumanInterviewMeeting,
} from "@/lib/client/api";
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/client/clipboard";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import { DateTimePicker } from "@/components/date-time-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Label } from "@/components/ui/label";
import {
  addOneHourToDateTimeLocalInputValue,
  addOneHourToIsoString,
  canCancelHumanInterviewRound,
  canCompleteHumanInterviewRound,
  canEndHumanInterviewMeeting,
  canOpenMeetingLinks,
  canRescheduleHumanInterviewRound,
  describeRoundSummaryStatus,
  hasRoundDetails,
  toDateTimeLocalInputValue,
} from "./human-interview-stage-utils";
import { getCreatedMeetingFeishuFailure } from "./human-interview-feishu-error";
import { HumanInterviewOutcomeDialog } from "./human-interview-outcome-dialog";

interface RoundDateTimePickerProps {
  className: string;
  disabled: boolean;
  id: string;
  onValueChange: (value: string) => void;
  required?: boolean;
  value: string;
}

export interface RoundCardDependencies {
  isApiError: typeof isApiError;
  notifyError: (message: string) => void;
  notifySuccess: (message: string) => void;
  notifyWarning: (message: string) => void;
  patchHumanInterviewRound: typeof patchHumanInterviewRound;
  renderDateTimePicker: (props: RoundDateTimePickerProps) => ReactNode;
  updateHumanInterviewMeeting: typeof updateHumanInterviewMeeting;
}

const defaultRoundCardDependencies: RoundCardDependencies = {
  isApiError,
  notifyError: (message) => toast.error(message),
  notifySuccess: (message) => toast.success(message),
  notifyWarning: (message) => toast.warning(message),
  patchHumanInterviewRound,
  renderDateTimePicker: (props) => (
    <DateTimePicker
      className={props.className}
      disabled={props.disabled}
      id={props.id}
      onValueChange={props.onValueChange}
      required={props.required}
      value={props.value}
    />
  ),
  updateHumanInterviewMeeting,
};

async function copyMeetingLink(url: string, label: string) {
  const result = await copyTextToClipboard(toAbsoluteUrl(url));
  if (result === "copied") {
    toast.success(`${label}已复制`);
  } else if (result === "manual") {
    toast.info("已打开手动复制窗口");
  } else {
    toast.error("复制失败，请在全部链接中手动复制");
  }
}

// oxlint-disable-next-line complexity -- the card composes permission, meeting lifecycle, evaluation, and scheduling states.
export function RoundCard({
  round,
  canCreate,
  canDelete,
  canUpdate,
  disabled,
  meeting,
  meetingDetailLink,
  onComplete,
  onCancel,
  onCreateMeeting,
  onEndMeeting,
  onOpenLinks,
  onRescheduled,
  onReview,
  roundNumber,
  slug,
  dependencies = defaultRoundCardDependencies,
}: {
  round: HumanInterviewRoundRecord;
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  disabled?: boolean;
  meeting: HumanInterviewMeetingRecord | null;
  meetingDetailLink?: ReactNode;
  onComplete: () => void;
  onCancel: () => void;
  onCreateMeeting: () => void;
  onEndMeeting: (meeting: HumanInterviewMeetingRecord) => void;
  onOpenLinks: (meeting: HumanInterviewMeetingRecord) => void;
  onRescheduled: () => void;
  onReview: (meeting: HumanInterviewMeetingRecord) => void;
  roundNumber: number;
  slug: string;
  dependencies?: RoundCardDependencies;
}) {
  const statusBadge = describeRoundSummaryStatus(round, meeting);
  const [outcomeDialogOpen, setOutcomeDialogOpen] = useState(false);
  const canWrite = disabled !== true;
  const canCreateMeeting =
    canCreate &&
    meeting === null &&
    round.status === "pending" &&
    canWrite &&
    Boolean(round.scheduledAt);
  const canCancelRound = canDelete && canCancelHumanInterviewRound(round, meeting, disabled);
  const canCompleteRound = canUpdate && canCompleteHumanInterviewRound(round, meeting, disabled);
  const canReviewRound = Boolean(
    canUpdate && canWrite && round.status === "pending" && meeting?.status === "ended",
  );

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                第 {roundNumber} 轮 · {round.label}
              </span>
              <Badge variant={statusBadge.tone}>{statusBadge.label}</Badge>
              {canUpdate &&
              canWrite &&
              round.status === "completed" &&
              round.outcome === "inconclusive" ? (
                <Button size="sm" variant="outline" onClick={() => setOutcomeDialogOpen(true)}>
                  <IconPencil className="size-3" />
                  修改
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
              <RoundScheduledAtControl
                canUpdate={canUpdate}
                dependencies={dependencies}
                disabled={disabled}
                meeting={meeting}
                onRescheduled={onRescheduled}
                round={round}
                slug={slug}
              />
              <span className="inline-flex items-center gap-1">
                {humanInterviewFormatMeta[round.format].label}
              </span>
              <span className="inline-flex items-center gap-1">
                <IconUsers className="size-3" />
                {round.interviewers.map((i) => i.name).join("、") || "未指派面试官"}
              </span>
            </div>
          </div>
          {meeting?.status === "ended" ? meetingDetailLink : null}
        </div>

        {round.interviewers.length > 0 ? (
          <InterviewerAssignmentList meeting={meeting} round={round} />
        ) : null}

        {round.evaluation ? <RoundEvaluation evaluation={round.evaluation} round={round} /> : null}

        {hasRoundDetails(round) ? (
          <div className="space-y-1 border-border/40 border-t pt-3 text-sm">
            {round.score === null ? null : (
              <div className="text-muted-foreground text-xs">
                评分：<span className="font-medium text-foreground">{round.score}</span>
              </div>
            )}
            {!round.evaluation && round.feedback ? (
              <p className="whitespace-pre-wrap text-foreground/90 text-xs leading-relaxed">
                {round.feedback}
              </p>
            ) : null}
            {round.cancelReason ? (
              <p className="text-muted-foreground text-xs">取消原因：{round.cancelReason}</p>
            ) : null}
          </div>
        ) : null}

        <RoundCardActions
          canCancelRound={canCancelRound}
          canCompleteRound={canCompleteRound}
          canCreateMeeting={canCreateMeeting}
          canEndMeeting={canUpdate && canEndHumanInterviewMeeting(meeting, disabled)}
          canOpenLinks={canOpenMeetingLinks(meeting)}
          canReviewRound={canReviewRound}
          meeting={meeting}
          onCancel={onCancel}
          onComplete={onComplete}
          onCreateMeeting={onCreateMeeting}
          onEndMeeting={onEndMeeting}
          onOpenLinks={onOpenLinks}
          onReview={onReview}
          slug={slug}
        />
      </CardContent>
      {outcomeDialogOpen ? (
        <HumanInterviewOutcomeDialog
          round={round}
          slug={slug}
          onClose={() => setOutcomeDialogOpen(false)}
        />
      ) : null}
    </Card>
  );
}

interface InterviewerAssignmentDescription {
  label: string;
  tone: "danger" | "outline" | "success" | "warning";
}

function describeInterviewerAssignment(
  interviewer: HumanInterviewRoundRecord["interviewers"][number],
  meeting: HumanInterviewMeetingRecord | null,
): InterviewerAssignmentDescription {
  if (interviewer.status === "declined") {
    return { label: "需联系 HR", tone: "danger" };
  }
  if (
    interviewer.status === "confirmed" &&
    meeting &&
    interviewer.confirmedScheduleVersion === meeting.scheduleVersion
  ) {
    return { label: "已安排", tone: "success" };
  }
  if (interviewer.status === "confirmed") {
    return { label: "安排已更新", tone: "warning" };
  }
  return { label: "已安排", tone: "success" };
}

function InterviewerAssignmentList({
  meeting,
  round,
}: {
  meeting: HumanInterviewMeetingRecord | null;
  round: HumanInterviewRoundRecord;
}) {
  return (
    <div className="flex flex-wrap gap-2 border-border/40 border-t pt-3">
      {round.interviewers.map((interviewer) => {
        const status = describeInterviewerAssignment(interviewer, meeting);
        return (
          <span className="inline-flex items-center gap-1.5 text-xs" key={interviewer.id}>
            <span>{interviewer.name}</span>
            <Badge variant={status.tone}>{status.label}</Badge>
          </span>
        );
      })}
    </div>
  );
}

function RoundScheduledAtControl({
  round,
  meeting,
  canUpdate,
  disabled,
  onRescheduled,
  slug,
  dependencies,
}: {
  round: HumanInterviewRoundRecord;
  meeting: HumanInterviewMeetingRecord | null;
  canUpdate: boolean;
  disabled?: boolean;
  dependencies: RoundCardDependencies;
  onRescheduled: () => void;
  slug: string;
}) {
  const [editing, setEditing] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() =>
    toDateTimeLocalInputValue(round.scheduledAt),
  );
  const [validUntil, setValidUntil] = useState(() =>
    toDateTimeLocalInputValue(meeting?.validUntil ?? addOneHourToIsoString(round.scheduledAt)),
  );
  const canReschedule = canUpdate && canRescheduleHumanInterviewRound(round, meeting, disabled);
  const inputId = `human-round-${round.id}-scheduled-at`;
  const validUntilInputId = `human-round-${round.id}-valid-until`;
  const mutation = useMutation({
    mutationFn: async () => {
      const nextScheduledAt = dateTimeLocalInputToISOString(scheduledAt);
      const nextValidUntil = dateTimeLocalInputToISOString(validUntil);
      if (!nextScheduledAt) {
        throw new Error("请输入有效的面试时间");
      }
      try {
        await (meeting
          ? dependencies.updateHumanInterviewMeeting(slug, meeting.id, {
              scheduledAt: nextScheduledAt,
              validUntil: nextValidUntil,
            })
          : dependencies.patchHumanInterviewRound(slug, round.interviewRecordId, round.id, {
              scheduledAt: nextScheduledAt,
              validUntil: nextValidUntil,
            }));
        return { feishuFailure: null };
      } catch (error) {
        const feishuFailure =
          meeting && dependencies.isApiError(error) ? getCreatedMeetingFeishuFailure(error) : null;
        if (!feishuFailure) {
          throw error;
        }
        return { feishuFailure };
      }
    },
    onError: (e) => dependencies.notifyError(e instanceof Error ? e.message : "调整时间失败"),
    onSuccess: ({ feishuFailure }) => {
      const notify = feishuFailure ? dependencies.notifyWarning : dependencies.notifySuccess;
      const message = feishuFailure
        ? "面试时间已调整，但飞书同步失败，可在会议链接中重试"
        : "面试时间已调整";
      notify(message);
      setEditing(false);
      onRescheduled();
    },
  });

  function startEditing() {
    if (!canReschedule) {
      return;
    }
    setScheduledAt(toDateTimeLocalInputValue(round.scheduledAt));
    setValidUntil(
      toDateTimeLocalInputValue(meeting?.validUntil ?? addOneHourToIsoString(round.scheduledAt)),
    );
    setEditing(true);
  }

  function cancelEditing() {
    setScheduledAt(toDateTimeLocalInputValue(round.scheduledAt));
    setValidUntil(
      toDateTimeLocalInputValue(meeting?.validUntil ?? addOneHourToIsoString(round.scheduledAt)),
    );
    setEditing(false);
  }

  function handleScheduledAtChange(value: string) {
    setScheduledAt(value);
    if (!validUntil) {
      setValidUntil(addOneHourToDateTimeLocalInputValue(value));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    mutation.mutate();
  }

  if (editing) {
    return (
      <form className="inline-flex min-h-7 flex-wrap items-center gap-1.5" onSubmit={handleSubmit}>
        <Label className="sr-only" htmlFor={inputId}>
          面试时间
        </Label>
        {dependencies.renderDateTimePicker({
          className: "h-7 w-[13.5rem] text-xs",
          disabled: mutation.isPending,
          id: inputId,
          onValueChange: handleScheduledAtChange,
          required: true,
          value: scheduledAt,
        })}
        <Label className="sr-only" htmlFor={validUntilInputId}>
          有效时间至
        </Label>
        {dependencies.renderDateTimePicker({
          className: "h-7 w-[13.5rem] text-xs",
          disabled: mutation.isPending,
          id: validUntilInputId,
          onValueChange: setValidUntil,
          value: validUntil,
        })}
        <Button
          aria-label="保存面试时间"
          className="h-7 w-7 p-0"
          disabled={mutation.isPending}
          size="icon"
          title="保存面试时间"
          type="submit"
        >
          {mutation.isPending ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : (
            <IconCheck className="size-3.5" />
          )}
        </Button>
        <Button
          aria-label="取消调整时间"
          className="h-7 w-7 p-0"
          disabled={mutation.isPending}
          onClick={cancelEditing}
          size="icon"
          title="取消调整时间"
          type="button"
          variant="outline"
        >
          <IconX className="size-3.5" />
        </Button>
      </form>
    );
  }

  return (
    <span className="inline-flex min-h-7 flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1">
        {round.scheduledAt ? (
          <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={round.scheduledAt} />
        ) : (
          <span className="text-muted-foreground/70">时间未定</span>
        )}
      </span>
      {meeting?.validUntil ? (
        <span className="inline-flex items-center gap-1">
          有效至 <TimeDisplay options={DATE_TIME_DISPLAY_OPTIONS} value={meeting.validUntil} />
        </span>
      ) : null}
      {canReschedule ? (
        <Button
          aria-label="调整面试时间"
          className="h-6 w-6 p-0"
          onClick={startEditing}
          size="icon"
          title="调整面试时间"
          variant="ghost"
        >
          <IconPencil className="size-3.5" />
        </Button>
      ) : null}
    </span>
  );
}

function RoundCardActions({
  meeting,
  canCreateMeeting,
  canOpenLinks,
  canReviewRound,
  canEndMeeting,
  canCancelRound,
  canCompleteRound,
  onComplete,
  onCancel,
  onCreateMeeting,
  onEndMeeting,
  onOpenLinks,
  onReview,
  slug,
}: {
  meeting: HumanInterviewMeetingRecord | null;
  canCreateMeeting: boolean;
  canOpenLinks: boolean;
  canReviewRound: boolean;
  canEndMeeting: boolean;
  canCancelRound: boolean;
  canCompleteRound: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onCreateMeeting: () => void;
  onEndMeeting: (meeting: HumanInterviewMeetingRecord) => void;
  onOpenLinks: (meeting: HumanInterviewMeetingRecord) => void;
  onReview: (meeting: HumanInterviewMeetingRecord) => void;
  slug: string;
}) {
  const hasActions =
    canCreateMeeting ||
    canOpenLinks ||
    canEndMeeting ||
    canCancelRound ||
    canCompleteRound ||
    canReviewRound;
  if (!hasActions) {
    return null;
  }

  function handleOpenLinks() {
    if (meeting) {
      onOpenLinks(meeting);
    }
  }

  function handleEndMeeting() {
    if (meeting) {
      onEndMeeting(meeting);
    }
  }

  function handleReview() {
    if (meeting) {
      onReview(meeting);
    }
  }

  return (
    <div className="flex flex-wrap justify-end gap-2 border-border/40 border-t pt-3">
      {canCreateMeeting ? (
        <Button onClick={onCreateMeeting} size="sm" variant="outline">
          <IconVideo className="size-4" />
          创建会议
        </Button>
      ) : null}
      {canOpenLinks ? (
        <MeetingConfirmationLinkActions
          meeting={meeting}
          onOpenLinks={handleOpenLinks}
          slug={slug}
        />
      ) : null}
      {canEndMeeting ? (
        <Button onClick={handleEndMeeting} size="sm" variant="outline">
          <IconPlayerStop className="size-4" />
          结束会议
        </Button>
      ) : null}
      {canReviewRound ? (
        <Button onClick={handleReview} size="sm">
          <IconChecklist className="size-4" />
          评价并完成
        </Button>
      ) : null}
      {canCompleteRound ? (
        <Button onClick={onComplete} size="sm" variant="outline">
          <IconCircleCheck className="size-4" />
          标记完成
        </Button>
      ) : null}
      {canCancelRound ? (
        <Button onClick={onCancel} size="sm" variant="outline">
          <IconBan className="size-4" />
          取消轮次
        </Button>
      ) : null}
    </div>
  );
}

function MeetingConfirmationLinkActions({
  meeting,
  onOpenLinks,
  slug,
}: {
  meeting: HumanInterviewMeetingRecord | null;
  onOpenLinks: () => void;
  slug: string;
}) {
  const [open, setOpen] = useState(false);
  const { data: links, isFetching } = useQuery({
    enabled: open && Boolean(meeting),
    queryFn: () => {
      if (!meeting) {
        throw new Error("missing meeting");
      }
      return issueHumanInterviewMeetingLinks(slug, meeting.id);
    },
    queryKey: ["human-interview-meeting-links", slug, meeting?.id],
  });

  return (
    <HoverCard onOpenChange={setOpen}>
      <HoverCardTrigger
        render={
          <Button onClick={onOpenLinks} size="sm" variant="outline">
            <IconCopy className="size-4" />
            会议链接
          </Button>
        }
      />
      <HoverCardContent align="end" className="w-80 space-y-3" sideOffset={6}>
        <div>
          <p className="font-medium text-sm">快速复制面试链接</p>
          <p className="mt-1 text-muted-foreground text-xs">
            候选人使用确认入口，面试官使用会议入口，请按接收人分别发送。
          </p>
        </div>
        {isFetching ? (
          <p className="flex items-center gap-2 text-muted-foreground text-xs">
            <IconLoader2 className="size-3.5 animate-spin" />
            正在生成当前有效链接…
          </p>
        ) : null}
        {links ? (
          <div className="space-y-2">
            {links.candidateLinks.map((link) => (
              <Button
                className="w-full justify-start"
                key={link.roundId}
                onClick={() => copyMeetingLink(link.url, `${link.candidateName}的候选人确认链接`)}
                size="sm"
                variant="outline"
              >
                <IconCopy className="size-4" />
                复制候选人确认链接 · {link.candidateName}
              </Button>
            ))}
            {links.interviewerLinks.map((link) => (
              <Button
                className="w-full justify-start"
                key={link.userId}
                onClick={() => copyMeetingLink(link.url, `${link.name}的面试官会议链接`)}
                size="sm"
                variant="outline"
              >
                <IconCopy className="size-4" />
                复制面试官会议链接 · {link.name}
              </Button>
            ))}
          </div>
        ) : null}
        <Button className="w-full" onClick={onOpenLinks} size="sm" variant="ghost">
          查看全部链接与有效期
        </Button>
      </HoverCardContent>
    </HoverCard>
  );
}
