"use client";

/* oxlint-disable no-use-before-define -- helper components follow the public card */

import {
  IconBan,
  IconCheck,
  IconCircleCheck,
  IconCopy,
  IconLoader2,
  IconPencil,
  IconPlayerStop,
  IconUsers,
  IconVideo,
  IconX,
} from "@tabler/icons-react";
import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { humanInterviewFormatMeta } from "@arc/db-schema/studio-interviews";
import type {
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@arc/shared/studio-pipeline-stages";
import { dateTimeLocalInputToISOString } from "@/lib/client/datetime-local";
import { patchHumanInterviewRound } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import { DateTimePicker } from "@/components/date-time-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function RoundCard({
  round,
  canCreate,
  canDelete,
  canUpdate,
  disabled,
  meeting,
  onComplete,
  onCancel,
  onCreateMeeting,
  onEndMeeting,
  onOpenLinks,
  onRescheduled,
}: {
  round: HumanInterviewRoundRecord;
  canCreate: boolean;
  canDelete: boolean;
  canUpdate: boolean;
  disabled?: boolean;
  meeting: HumanInterviewMeetingRecord | null;
  onComplete: () => void;
  onCancel: () => void;
  onCreateMeeting: () => void;
  onEndMeeting: (meeting: HumanInterviewMeetingRecord) => void;
  onOpenLinks: (meeting: HumanInterviewMeetingRecord) => void;
  onRescheduled: () => void;
}) {
  const statusBadge = describeRoundSummaryStatus(round, meeting);
  const canWrite = disabled !== true;
  const canCreateMeeting =
    canCreate &&
    meeting === null &&
    round.status === "pending" &&
    canWrite &&
    Boolean(round.scheduledAt);
  const canCancelRound = canDelete && canCancelHumanInterviewRound(round, meeting, disabled);
  const canCompleteRound = canUpdate && canCompleteHumanInterviewRound(round, meeting, disabled);

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardContent className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                第 {round.sortOrder + 1} 轮 · {round.label}
              </span>
              <Badge variant={statusBadge.tone}>{statusBadge.label}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
              <RoundScheduledAtControl
                canUpdate={canUpdate}
                disabled={disabled}
                meeting={meeting}
                onRescheduled={onRescheduled}
                round={round}
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
        </div>

        {hasRoundDetails(round) ? (
          <div className="space-y-1 border-border/40 border-t pt-3 text-sm">
            {round.score === null ? null : (
              <div className="text-muted-foreground text-xs">
                评分：<span className="font-medium text-foreground">{round.score}</span>
              </div>
            )}
            {round.feedback ? (
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
          meeting={meeting}
          onCancel={onCancel}
          onComplete={onComplete}
          onCreateMeeting={onCreateMeeting}
          onEndMeeting={onEndMeeting}
          onOpenLinks={onOpenLinks}
        />
      </CardContent>
    </Card>
  );
}

export function RoundScheduledAtControl({
  round,
  meeting,
  canUpdate,
  disabled,
  onRescheduled,
}: {
  round: HumanInterviewRoundRecord;
  meeting: HumanInterviewMeetingRecord | null;
  canUpdate: boolean;
  disabled?: boolean;
  onRescheduled: () => void;
}) {
  const slug = useWorkspaceSlug();
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
    mutationFn: () =>
      patchHumanInterviewRound(slug, round.interviewRecordId, round.id, {
        scheduledAt: dateTimeLocalInputToISOString(scheduledAt),
        validUntil: dateTimeLocalInputToISOString(validUntil),
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "调整时间失败"),
    onSuccess: () => {
      toast.success("面试时间已调整");
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
        <DateTimePicker
          className="h-7 w-[13.5rem] text-xs"
          disabled={mutation.isPending}
          id={inputId}
          onValueChange={handleScheduledAtChange}
          required
          value={scheduledAt}
        />
        <Label className="sr-only" htmlFor={validUntilInputId}>
          有效时间至
        </Label>
        <DateTimePicker
          className="h-7 w-[13.5rem] text-xs"
          disabled={mutation.isPending}
          id={validUntilInputId}
          onValueChange={setValidUntil}
          value={validUntil}
        />
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

export function RoundCardActions({
  meeting,
  canCreateMeeting,
  canOpenLinks,
  canEndMeeting,
  canCancelRound,
  canCompleteRound,
  onComplete,
  onCancel,
  onCreateMeeting,
  onEndMeeting,
  onOpenLinks,
}: {
  meeting: HumanInterviewMeetingRecord | null;
  canCreateMeeting: boolean;
  canOpenLinks: boolean;
  canEndMeeting: boolean;
  canCancelRound: boolean;
  canCompleteRound: boolean;
  onComplete: () => void;
  onCancel: () => void;
  onCreateMeeting: () => void;
  onEndMeeting: (meeting: HumanInterviewMeetingRecord) => void;
  onOpenLinks: (meeting: HumanInterviewMeetingRecord) => void;
}) {
  const hasActions =
    canCreateMeeting || canOpenLinks || canEndMeeting || canCancelRound || canCompleteRound;
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

  return (
    <div className="flex flex-wrap justify-end gap-2 border-border/40 border-t pt-3">
      {canCreateMeeting ? (
        <Button onClick={onCreateMeeting} size="sm" variant="outline">
          <IconVideo className="size-4" />
          创建会议
        </Button>
      ) : null}
      {canOpenLinks ? (
        <Button onClick={handleOpenLinks} size="sm" variant="outline">
          <IconCopy className="size-4" />
          复制链接
        </Button>
      ) : null}
      {canEndMeeting ? (
        <Button onClick={handleEndMeeting} size="sm" variant="outline">
          <IconPlayerStop className="size-4" />
          结束会议
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
