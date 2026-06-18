"use client";

/* oxlint-disable no-use-before-define -- helper components defined below export component for top-down readability */
// 真人复面阶段的详情面板内容：
//   - 列出所有轮次（含 cancelled），按 sortOrder 升序
//   - 「新建一轮」打开 schedule dialog
//   - pending 轮次可以「标记完成」/「取消」
//   - completed 轮次只读展示（评分 + 反馈）
// 数据 + dialog 全部聚在这个文件里，便于一处迭代。
//
// Human-interview stage panel: round list with create/complete/cancel actions.
// All data fetching and dialogs colocated here for fast iteration.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BanIcon,
  CheckCircle2Icon,
  CircleStopIcon,
  CopyIcon,
  CheckIcon,
  LinkIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  UsersIcon,
  VideoIcon,
  XIcon,
} from "@/components/icons/hugeicons";
import type { FormEvent, MouseEvent, ReactNode } from "react";
import { useReducer, useState } from "react";
import { toast } from "sonner";
import {
  humanInterviewFormatMeta,
  humanInterviewRoundOutcomeMeta,
} from "@arc/db-schema/studio-interviews";
import type {
  HumanInterviewMeetingInterviewerRole,
  HumanInterviewRoundOutcome,
} from "@arc/db-schema/studio-interviews";
import type {
  HumanInterviewMeetingLinkBundle,
  HumanInterviewMeetingRecord,
  HumanInterviewRoundRecord,
} from "@arc/shared/studio-pipeline-stages";
import { dateTimeLocalInputToISOString } from "@/lib/client/datetime-local";
import {
  cancelHumanInterviewRound,
  completeHumanInterviewRound,
  createHumanInterviewMeeting,
  createHumanInterviewRound,
  endHumanInterviewMeeting,
  issueHumanInterviewMeetingLinks,
  listHumanInterviewMeetings,
  listHumanInterviewRounds,
  patchHumanInterviewRound,
} from "@/lib/client/api";
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/client/clipboard";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Textarea } from "@/components/ui/textarea";

// 工作区成员（面试官多选用）。
// Workspace members for the interviewer multi-select.
interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

function useWorkspaceMembers() {
  const slug = useWorkspaceSlug();
  return useQuery({
    queryFn: () =>
      rpcFetch<{ records: WorkspaceMember[] }>(
        rpc.api.w[":slug"].studio.workspace.members.$get({ param: { slug } }),
        "加载成员列表失败",
      ),
    queryKey: ["workspace-members", slug],
    staleTime: 60_000,
  });
}

interface PanelProps {
  candidateId: string;
  candidateName: string;
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

export function HumanInterviewStagePanel({ candidateId, candidateName, disabled }: PanelProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { data: rounds = [], isLoading } = useQuery({
    queryFn: () => listHumanInterviewRounds(slug, candidateId),
    queryKey: ["human-interview-rounds", slug, candidateId],
  });
  const { data: meetings = [] } = useQuery({
    queryFn: () => listHumanInterviewMeetings(slug, { interviewRecordId: candidateId }),
    queryKey: ["human-interview-meetings", slug, candidateId],
  });

  function invalidateRounds() {
    void queryClient.invalidateQueries({
      queryKey: ["human-interview-rounds", slug, candidateId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["human-interview-meetings", slug, candidateId],
    });
    // 顶级简历库列表也要刷新（进度列依赖派生聚合）。
    // The resume library progress column depends on aggregated counts.
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  }

  const [dialogState, dispatchDialog] = useReducer(dialogReducer, initialDialogState);
  const { cancelTarget, completeTarget, endTarget, linksTarget, scheduleOpen } = dialogState;
  const endMeetingMutation = useMutation({
    mutationFn: (meetingId: string) => endHumanInterviewMeeting(slug, meetingId),
    onError: (e) => toast.error(e instanceof Error ? e.message : "结束会议失败"),
    onSuccess: () => {
      toast.success("会议已结束");
      dispatchDialog({ target: null, type: "endTargetChanged" });
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-rounds", slug, candidateId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-meetings", slug, candidateId],
      });
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
    },
  });
  const createMeetingMutation = useMutation({
    mutationFn: (round: HumanInterviewRoundRecord) =>
      createHumanInterviewMeeting(slug, {
        interviewerIds: round.interviewers.map((interviewer) => interviewer.id),
        notes: round.notes,
        roundIds: [round.id],
        scheduledAt: round.scheduledAt,
        title: round.label,
        validUntil: null,
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "创建视频会议失败"),
    onSuccess: () => {
      toast.success("已创建视频会议");
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-rounds", slug, candidateId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-meetings", slug, candidateId],
      });
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
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
    roundsContent = (
      <Empty className="border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <UsersIcon className="size-5" />
          </EmptyMedia>
          <EmptyTitle>尚未安排真人复面</EmptyTitle>
          <EmptyDescription>
            {disabled
              ? "已结案候选人不可新增复面，请先重新激活。"
              : "点「安排真人复面」创建线上复面会议。"}
          </EmptyDescription>
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
              disabled={disabled}
              key={round.id}
              meeting={meeting}
              onCancel={() => dispatchDialog({ target: round, type: "cancelTargetChanged" })}
              onComplete={() => dispatchDialog({ target: round, type: "completeTargetChanged" })}
              onCreateMeeting={() => createMeetingMutation.mutate(round)}
              onEndMeeting={(item) => dispatchDialog({ target: item, type: "endTargetChanged" })}
              onOpenLinks={(item) => dispatchDialog({ target: item, type: "linksTargetChanged" })}
              onRescheduled={invalidateRounds}
              round={round}
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

      {disabled ? null : (
        <div className="flex justify-end w-full">
          <Button
            onClick={() => dispatchDialog({ open: true, type: "scheduleOpenChanged" })}
            size="lg"
            className="w-full"
          >
            <PlusIcon className="size-4" />
            安排真人复面
          </Button>
        </div>
      )}

      <ScheduleRoundDialog
        candidateId={candidateId}
        existingCount={rounds.length}
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
function RoundCard({
  round,
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
    meeting === null && round.status === "pending" && canWrite && Boolean(round.scheduledAt);
  const canCancelRound = canCancelHumanInterviewRound(round, meeting, disabled);
  const canCompleteRound = canCompleteHumanInterviewRound(round, meeting, disabled);

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
                disabled={disabled}
                meeting={meeting}
                onRescheduled={onRescheduled}
                round={round}
              />
              <span className="inline-flex items-center gap-1">
                {humanInterviewFormatMeta[round.format].label}
              </span>
              <span className="inline-flex items-center gap-1">
                <UsersIcon className="size-3" />
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
          canEndMeeting={canEndHumanInterviewMeeting(meeting, disabled)}
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

function RoundScheduledAtControl({
  round,
  meeting,
  disabled,
  onRescheduled,
}: {
  round: HumanInterviewRoundRecord;
  meeting: HumanInterviewMeetingRecord | null;
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
  const canReschedule = canRescheduleHumanInterviewRound(round, meeting, disabled);
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
        <Input
          className="h-7 w-[13.5rem] text-xs"
          disabled={mutation.isPending}
          id={inputId}
          onChange={(e) => handleScheduledAtChange(e.target.value)}
          required
          type="datetime-local"
          value={scheduledAt}
        />
        <Label className="sr-only" htmlFor={validUntilInputId}>
          有效时间至
        </Label>
        <Input
          className="h-7 w-[13.5rem] text-xs"
          disabled={mutation.isPending}
          id={validUntilInputId}
          onChange={(e) => setValidUntil(e.target.value)}
          type="datetime-local"
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
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <CheckIcon className="size-3.5" />
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
          <XIcon className="size-3.5" />
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
          <PencilIcon className="size-3.5" />
        </Button>
      ) : null}
    </span>
  );
}

function RoundCardActions({
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
          <VideoIcon className="size-4" />
          创建会议
        </Button>
      ) : null}
      {canOpenLinks ? (
        <Button onClick={handleOpenLinks} size="sm" variant="outline">
          <CopyIcon className="size-4" />
          复制链接
        </Button>
      ) : null}
      {canEndMeeting ? (
        <Button onClick={handleEndMeeting} size="sm" variant="outline">
          <CircleStopIcon className="size-4" />
          结束会议
        </Button>
      ) : null}
      {canCompleteRound ? (
        <Button onClick={onComplete} size="sm" variant="outline">
          <CheckCircle2Icon className="size-4" />
          标记完成
        </Button>
      ) : null}
      {canCancelRound ? (
        <Button onClick={onCancel} size="sm" variant="outline">
          <BanIcon className="size-4" />
          取消轮次
        </Button>
      ) : null}
    </div>
  );
}

function EndMeetingDialog({
  isPending,
  meeting,
  onConfirm,
  onOpenChange,
}: {
  isPending: boolean;
  meeting: HumanInterviewMeetingRecord | null;
  onConfirm: (meeting: HumanInterviewMeetingRecord) => Promise<unknown>;
  onOpenChange: (open: boolean) => void;
}) {
  async function handleConfirm(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (meeting) {
      try {
        await onConfirm(meeting);
      } catch {
        // The mutation already surfaces the error toast; keep the dialog open.
      }
    }
  }

  return (
    <AlertDialog onOpenChange={onOpenChange} open={meeting !== null}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>结束真人复面会议？</AlertDialogTitle>
          <AlertDialogDescription>
            结束后会关闭当前视频房间，已拿到链接的候选人和面试官将不能继续进入该会议。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>取消</AlertDialogCancel>
          <AlertDialogAction disabled={isPending} onClick={handleConfirm} variant="destructive">
            {isPending ? <Loader2Icon className="size-4 animate-spin" /> : null}
            确认结束
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

const interviewerRoleLabel: Record<HumanInterviewMeetingInterviewerRole, string> = {
  host: "主持人",
  interviewer: "面试官",
  observer: "旁听",
};

function MeetingLinksDialog({
  meeting,
  onOpenChange,
}: {
  meeting: HumanInterviewMeetingRecord | null;
  onOpenChange: (open: boolean) => void;
}) {
  const slug = useWorkspaceSlug();
  const { data, error, isFetching } = useQuery({
    enabled: Boolean(meeting),
    queryFn: () => {
      if (!meeting) {
        throw new Error("missing meeting");
      }
      return issueHumanInterviewMeetingLinks(slug, meeting.id);
    },
    queryKey: ["human-interview-meeting-links", slug, meeting?.id],
  });

  return (
    <Dialog onOpenChange={onOpenChange} open={meeting !== null}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>复制面试链接</DialogTitle>
          <DialogDescription>
            {meeting?.title ?? "真人复面会议"} 的候选人和面试官入场链接。
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60dvh] space-y-5 overflow-y-auto py-1">
          {isFetching ? (
            <Card className="gap-0 rounded-lg py-0">
              <CardContent className="flex items-center justify-center gap-2 p-6 text-muted-foreground text-sm">
                <Loader2Icon className="size-4 animate-spin" />
                生成链接中…
              </CardContent>
            </Card>
          ) : null}
          {error ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm">
              {error instanceof Error ? error.message : "生成链接失败"}
            </p>
          ) : null}
          {data ? <MeetingLinksContent links={data} /> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MeetingLinksContent({ links }: { links: HumanInterviewMeetingLinkBundle }) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-medium text-sm">
          <UsersIcon className="size-4" />
          候选人链接
        </h4>
        <div className="space-y-2">
          {links.candidateLinks.map((link) => (
            <MeetingLinkRow
              description={`${link.roundLabel} · 有效至 ${formatDateTime(link.expiresAt)}`}
              key={link.roundId}
              label={link.candidateName}
              url={link.url}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h4 className="flex items-center gap-2 font-medium text-sm">
          <LinkIcon className="size-4" />
          面试官链接
        </h4>
        <div className="space-y-2">
          {links.interviewerLinks.map((link) => (
            <MeetingLinkRow
              description={interviewerRoleLabel[link.role]}
              key={link.userId}
              label={link.name}
              url={link.url}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function MeetingLinkRow({
  description,
  label,
  url,
}: {
  description: string;
  label: string;
  url: string;
}) {
  const absoluteUrl = toAbsoluteUrl(url);

  async function handleCopy() {
    const result = await copyTextToClipboard(absoluteUrl);
    if (result === "copied") {
      toast.success("链接已复制");
      return;
    }
    if (result === "manual") {
      toast.info("已打开手动复制窗口");
      return;
    }
    toast.error("复制失败，请手动选择链接");
  }

  return (
    <Card className="gap-0 rounded-lg py-0">
      <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{label}</span>
            <Badge variant="outline">{description}</Badge>
          </div>
          <Input className="h-8 text-xs" readOnly value={absoluteUrl} />
        </div>
        <Button className="md:self-end" onClick={handleCopy} size="sm" variant="outline">
          <CopyIcon className="size-4" />
          复制
        </Button>
      </CardContent>
    </Card>
  );
}

function describeRoundSummaryStatus(
  round: HumanInterviewRoundRecord,
  meeting: HumanInterviewMeetingRecord | null,
): {
  label: string;
  tone: "success" | "warning" | "info" | "outline";
} {
  if (round.status === "cancelled") {
    return { label: "已取消", tone: "outline" };
  }
  if (round.status === "completed") {
    if (round.outcome) {
      return {
        label: `已完成 · ${humanInterviewRoundOutcomeMeta[round.outcome].label}`,
        tone: humanInterviewRoundOutcomeMeta[round.outcome].tone,
      };
    }
    return { label: "已完成", tone: "success" };
  }
  if (meeting) {
    return describeMeetingStatus(meeting);
  }
  return { label: "待安排", tone: "info" };
}

function describeMeetingStatus(meeting: HumanInterviewMeetingRecord): {
  label: string;
  tone: "success" | "warning" | "info" | "outline";
} {
  if (meeting.status === "cancelled") {
    return { label: "已取消", tone: "outline" };
  }
  if (meeting.status === "ended") {
    return { label: "已结束", tone: "outline" };
  }
  if (meeting.status === "in_progress") {
    return { label: "进行中", tone: "success" };
  }
  return { label: "待开始", tone: "info" };
}

function canOpenMeetingLinks(meeting: HumanInterviewMeetingRecord | null): boolean {
  return meeting !== null && meeting.status !== "ended";
}

function canEndHumanInterviewMeeting(
  meeting: HumanInterviewMeetingRecord | null,
  disabled?: boolean,
): boolean {
  if (disabled || !meeting) {
    return false;
  }
  return meeting.status === "in_progress";
}

function canCancelHumanInterviewRound(
  round: HumanInterviewRoundRecord,
  meeting: HumanInterviewMeetingRecord | null,
  disabled?: boolean,
): boolean {
  if (disabled || round.status !== "pending") {
    return false;
  }
  return meeting === null || meeting.status === "scheduled";
}

function canCompleteHumanInterviewRound(
  round: HumanInterviewRoundRecord,
  meeting: HumanInterviewMeetingRecord | null,
  disabled?: boolean,
): boolean {
  return disabled !== true && round.status === "pending" && meeting?.status === "ended";
}

function canRescheduleHumanInterviewRound(
  round: HumanInterviewRoundRecord,
  meeting: HumanInterviewMeetingRecord | null,
  disabled?: boolean,
): boolean {
  if (disabled || round.status !== "pending") {
    return false;
  }
  return meeting === null || meeting.status === "scheduled";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 卡片底部「评分 / 反馈 / 取消原因」区块是否需要渲染。
// 抽成 helper 避免在 JSX 里堆负条件被 no-negated-condition 标记。
// Helper for the "extra details" footer visibility; keeps JSX free of negated
// equality checks.
function hasRoundDetails(round: HumanInterviewRoundRecord): boolean {
  return Boolean(round.feedback) || round.score !== null || Boolean(round.cancelReason);
}

function formatDateTime(iso: string): string {
  // 用本地时区按 YYYY-MM-DD HH:mm 展示，避免国际化包负担。
  // Local time-zone, no i18n lib.
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function toDateTimeLocalInputValue(iso: string | null): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function addOneHourToIsoString(iso: string | null): string | null {
  if (!iso) {
    return null;
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return new Date(date.getTime() + 60 * 60 * 1000).toISOString();
}

function addOneHourToDateTimeLocalInputValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return toDateTimeLocalInputValue(new Date(date.getTime() + 60 * 60 * 1000).toISOString());
}

// ── 新建轮次 dialog ──
// Schedule (create) dialog.

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  existingCount: number;
  onScheduled: () => void;
}

// 预设轮次标签：第 N 轮根据现有数量推荐，HR 可以自定义。
// Preset round labels picked from existing count; HR can override.
function defaultRoundLabel(existingCount: number): string {
  const labels = ["技术复面", "HR 复面", "总监终面", "跨部门面"];
  return labels[existingCount] ?? `第 ${existingCount + 1} 轮`;
}

function ScheduleRoundDialog({
  open,
  onOpenChange,
  candidateId,
  existingCount,
  onScheduled,
}: ScheduleDialogProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { data: members } = useWorkspaceMembers();
  const [label, setLabel] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  function reset() {
    setLabel("");
    setScheduledAt("");
    setValidUntil("");
    setInterviewerIds([]);
    setNotes("");
  }

  function handleScheduledAtChange(value: string) {
    setScheduledAt(value);
    if (!validUntil) {
      setValidUntil(addOneHourToDateTimeLocalInputValue(value));
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const roundLabel = label.trim() || defaultRoundLabel(existingCount);
      const scheduledAtIso = dateTimeLocalInputToISOString(scheduledAt);
      if (!scheduledAtIso) {
        throw new Error("请填写面试时间");
      }
      const round = await createHumanInterviewRound(slug, candidateId, {
        format: "online",
        interviewerIds,
        label: roundLabel,
        location: null,
        meetingUrl: null,
        notes: notes.trim() || null,
        scheduledAt: scheduledAtIso,
      });
      const validUntilIso = dateTimeLocalInputToISOString(validUntil);
      await createHumanInterviewMeeting(slug, {
        interviewerIds,
        notes: notes.trim() || null,
        roundIds: [round.id],
        scheduledAt: scheduledAtIso,
        title: roundLabel,
        validUntil: validUntilIso,
      });
      return round;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "创建失败"),
    onSuccess: () => {
      toast.success("已安排线上真人复面");
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-rounds", slug, candidateId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-meetings", slug, candidateId],
      });
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
      onScheduled();
      handleOpenChange(false);
    },
  });

  const memberOptions = (members?.records ?? []).map((m) => ({
    label: m.name,
    value: m.id,
  }));

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>安排真人复面</DialogTitle>
          <DialogDescription>
            填好基础信息后保存。系统会创建线上复面会议；有效时间为空时默认到面试时间后一小时。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="round-label">
              轮次标签
            </Label>
            <Input
              id="round-label"
              maxLength={50}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={defaultRoundLabel(existingCount)}
              value={label}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="scheduled-at">
              面试时间
            </Label>
            <Input
              id="scheduled-at"
              onChange={(e) => handleScheduledAtChange(e.target.value)}
              required
              type="datetime-local"
              value={scheduledAt}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="valid-until">
              有效时间至
            </Label>
            <Input
              id="valid-until"
              onChange={(e) => setValidUntil(e.target.value)}
              type="datetime-local"
              value={validUntil}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm">面试官</Label>
            <SearchableMultiSelect
              emptyMessage="找不到匹配的成员"
              onChange={setInterviewerIds}
              options={memberOptions}
              placeholder="选择面试官（可多选）"
              searchPlaceholder="搜索成员…"
              selectedFormat={(count) => `已选 ${count} 位面试官`}
              selectedPreviewLimit={2}
              value={interviewerIds}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="round-notes">
              备注（可选）
            </Label>
            <Textarea
              id="round-notes"
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="给自己看的提示，如重点考察方向"
              rows={2}
              value={notes}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            取消
          </Button>
          <Button
            disabled={mutation.isPending || interviewerIds.length === 0}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 标记完成 dialog ──
// Complete-round dialog.

interface CompleteDialogProps {
  round: HumanInterviewRoundRecord | null;
  candidateId: string;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

function CompleteRoundDialog({
  round,
  candidateId,
  onOpenChange,
  onCompleted,
}: CompleteDialogProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [outcome, setOutcome] = useState<HumanInterviewRoundOutcome>("pass");
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setOutcome("pass");
      setScore("");
      setFeedback("");
    }
    onOpenChange(next);
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!round) {
        throw new Error("missing round");
      }
      const parsedScore = score === "" ? null : Number(score);
      if (
        parsedScore !== null &&
        (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100)
      ) {
        throw new Error("评分需为 0-100 的数字");
      }
      return completeHumanInterviewRound(slug, candidateId, round.id, {
        feedback: feedback.trim() || null,
        outcome,
        score: parsedScore,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "标记完成失败"),
    onSuccess: () => {
      toast.success("已标记完成");
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-rounds", slug, candidateId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-meetings", slug, candidateId],
      });
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
      onCompleted();
      handleOpenChange(false);
    },
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={round !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>标记完成：{round?.label}</DialogTitle>
          <DialogDescription>
            录入面试结果。完成后会自动结束该轮次下的会议，且只能修改评分和反馈。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid gap-1.5">
            <Label className="text-sm">结果</Label>
            <RadioGroup
              className="grid grid-cols-3 gap-2"
              onValueChange={(v) => setOutcome(v as HumanInterviewRoundOutcome)}
              value={outcome}
            >
              {(Object.keys(humanInterviewRoundOutcomeMeta) as HumanInterviewRoundOutcome[]).map(
                (v) => (
                  <div className="flex items-center gap-2" key={v}>
                    <RadioGroupItem id={`outcome-${v}`} value={v} />
                    <Label className="cursor-pointer text-sm" htmlFor={`outcome-${v}`}>
                      {humanInterviewRoundOutcomeMeta[v].label}
                    </Label>
                  </div>
                ),
              )}
            </RadioGroup>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="round-score">
              评分（0-100，可选）
            </Label>
            <Input
              id="round-score"
              inputMode="numeric"
              max={100}
              min={0}
              onChange={(e) => setScore(e.target.value)}
              type="number"
              value={score}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="round-feedback">
              反馈（可选）
            </Label>
            <Textarea
              id="round-feedback"
              maxLength={5000}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="对候选人的评价、亮点、不足……"
              rows={4}
              value={feedback}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            取消
          </Button>
          <Button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "保存中…" : "确认完成"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 取消 dialog ──
// Cancel-round dialog.

interface CancelDialogProps {
  round: HumanInterviewRoundRecord | null;
  candidateId: string;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}

function CancelRoundDialog({ round, candidateId, onOpenChange, onCancelled }: CancelDialogProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  function handleOpenChange(next: boolean) {
    if (!next) {
      setReason("");
    }
    onOpenChange(next);
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (!round) {
        throw new Error("missing round");
      }
      return cancelHumanInterviewRound(slug, candidateId, round.id, {
        reason: reason.trim() || null,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "取消失败"),
    onSuccess: () => {
      toast.success("已取消该轮");
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-rounds", slug, candidateId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["human-interview-meetings", slug, candidateId],
      });
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
      onCancelled();
      handleOpenChange(false);
    },
  });

  return (
    <Dialog onOpenChange={handleOpenChange} open={round !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>取消轮次：{round?.label}</DialogTitle>
          <DialogDescription>
            取消后该轮不会算入复面统计，关联的视频会议也会一并删除；如想保留为「已完成」请改走「标记完成」流程。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-1.5 py-2">
          <Label className="text-sm" htmlFor="cancel-reason">
            取消原因（可选）
          </Label>
          <Textarea
            id="cancel-reason"
            maxLength={500}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例如：候选人临时有事；面试官请假"
            rows={3}
            value={reason}
          />
        </div>

        <DialogFooter>
          <Button
            disabled={mutation.isPending}
            onClick={() => handleOpenChange(false)}
            variant="outline"
          >
            返回
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() => mutation.mutate()}
            variant="destructive"
          >
            {mutation.isPending ? "处理中…" : "确认取消"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
