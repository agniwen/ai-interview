"use client";

import { IconRefresh, IconUserPlus } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { humanInterviewRoundOutcomeMeta } from "@arc/db-schema/studio-interviews";
import type { HumanInterviewRoundOutcome } from "@arc/db-schema/studio-interviews";
import type { HumanInterviewRoundRecord } from "@arc/shared/studio-pipeline-stages";
import { dateTimeLocalInputToISOString } from "@/lib/client/datetime-local";
import {
  cancelHumanInterviewRound,
  completeHumanInterviewRound,
  createHumanInterviewMeeting,
  createHumanInterviewRound,
  isApiError,
} from "@/lib/client/api";
import { invalidateHumanInterviewCandidateQueries } from "@/lib/client/api/query-keys";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { DateTimePicker } from "@/components/date-time-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SearchableMultiSelect } from "@/components/ui/searchable-multi-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { getCreatedMeetingFeishuFailure } from "./human-interview-feishu-error";
import { InviteDialog } from "./members/invite-dialog";
import {
  addOneHourToDateTimeLocalInputValue,
  buildHumanInterviewMeetingTitle,
} from "./human-interview-stage-utils";

type FeishuProviderId = "feishu" | "feishu-jiguang-hr";

interface WorkspaceMember {
  id: string;
  name: string;
  email: string;
  feishuProviderIds: FeishuProviderId[];
  image: string | null;
}

function getCommonFeishuProviderIds(members: WorkspaceMember[]): Set<FeishuProviderId> | null {
  const [firstMember, ...remainingMembers] = members;
  if (!firstMember) {
    return null;
  }
  const commonProviderIds = new Set(firstMember.feishuProviderIds);
  for (const member of remainingMembers) {
    for (const providerId of commonProviderIds) {
      if (!member.feishuProviderIds.includes(providerId)) {
        commonProviderIds.delete(providerId);
      }
    }
  }
  return commonProviderIds;
}

function useWorkspaceMembers(slug: string) {
  return useQuery({
    queryFn: () =>
      rpcFetch(
        rpc.api.w[":slug"].studio.workspace.members.$get({ param: { slug } }),
        "加载成员列表失败",
      ),
    queryKey: ["workspace-members", slug],
    staleTime: 60_000,
  });
}

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidateId: string;
  candidateName: string;
  passedRoundCount: number;
  onScheduled: () => void;
}

// 预设轮次标签只按已完成且通过的真人面试推进；取消的排期不会消耗业务轮次。
// Preset labels advance only after a passed human round; cancelled attempts stay
// on the same business round.
function defaultRoundLabel(passedRoundCount: number): string {
  const labels = ["技术复面", "HR 复面", "总监终面", "跨部门面"];
  return labels[passedRoundCount] ?? `业务复面 ${passedRoundCount + 1}`;
}

export interface ScheduleRoundDialogDependencies {
  slug: string;
}

export function ScheduleRoundDialogView({
  dependencies,
  open,
  onOpenChange,
  candidateId,
  candidateName,
  passedRoundCount,
  onScheduled,
}: ScheduleDialogProps & { dependencies: ScheduleRoundDialogDependencies }) {
  const { slug } = dependencies;
  const queryClient = useQueryClient();
  const membersQuery = useWorkspaceMembers(slug);
  const { data: members } = membersQuery;
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
      const roundLabel = label.trim() || defaultRoundLabel(passedRoundCount);
      const scheduledAtIso = dateTimeLocalInputToISOString(scheduledAt);
      if (!scheduledAtIso) {
        throw new Error("请填写面试时间");
      }
      if (interviewerIds.length === 0) {
        throw new Error("请选择工作区面试官");
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
      let feishuFailure = null;
      try {
        await createHumanInterviewMeeting(slug, {
          notes: notes.trim() || null,
          roundIds: [round.id],
          scheduledAt: scheduledAtIso,
          title: buildHumanInterviewMeetingTitle(candidateName, roundLabel),
          validUntil: validUntilIso,
        });
      } catch (error) {
        feishuFailure = isApiError(error) ? getCreatedMeetingFeishuFailure(error) : null;
        if (!feishuFailure) {
          throw error;
        }
      }
      return { feishuFailure, round };
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "创建失败"),
    onSuccess: ({ feishuFailure }) => {
      if (feishuFailure) {
        toast.warning("真人复面已安排，飞书同步失败，可在会议链接中重试");
      } else {
        toast.success("已安排线上真人复面");
      }
      void invalidateHumanInterviewCandidateQueries(queryClient, { candidateId, slug });
      onScheduled();
      handleOpenChange(false);
    },
  });

  async function refreshWorkspaceMembers() {
    const result = await membersQuery.refetch();
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : "刷新面试官列表失败");
      return;
    }
    toast.success("面试官列表已刷新");
  }

  const memberRecords = members?.records ?? [];
  const selectedMembers = memberRecords.filter((member) => interviewerIds.includes(member.id));
  const commonProviderIds = getCommonFeishuProviderIds(selectedMembers);
  const memberOptions = memberRecords.map((member) => ({
    avatarUrl: member.image,
    disabled:
      members?.feishuHumanInterviewEnabled === true &&
      !interviewerIds.includes(member.id) &&
      commonProviderIds !== null &&
      !member.feishuProviderIds.some((providerId) => commonProviderIds.has(providerId)),
    label: member.name,
    value: member.id,
  }));

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>安排真人复面</DialogTitle>
          <DialogDescription>
            保存后会创建线上复面会议；有效时间为空时默认到面试时间后一小时。
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
              placeholder={defaultRoundLabel(passedRoundCount)}
              value={label}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="scheduled-at">
              面试时间
            </Label>
            <DateTimePicker
              id="scheduled-at"
              onValueChange={handleScheduledAtChange}
              required
              value={scheduledAt}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="valid-until">
              有效时间至
            </Label>
            <DateTimePicker id="valid-until" onValueChange={setValidUntil} value={validUntil} />
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground text-xs">
                找不到面试官时，请先邀请对方加入工作区，加入后刷新列表。
              </p>
              <div className="flex items-center gap-1">
                <InviteDialog
                  assignableRoles={["member"]}
                  trigger={
                    <Button size="sm" type="button" variant="ghost">
                      <IconUserPlus data-icon="inline-start" />
                      邀请成员
                    </Button>
                  }
                  workspaceSlug={slug}
                />
                <Button
                  aria-label="刷新面试官列表"
                  disabled={membersQuery.isFetching}
                  onClick={refreshWorkspaceMembers}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {membersQuery.isFetching ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <IconRefresh data-icon="inline-start" />
                  )}
                  {membersQuery.isFetching ? "刷新中…" : "刷新"}
                </Button>
              </div>
            </div>
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

export function ScheduleRoundDialog(props: ScheduleDialogProps) {
  return <ScheduleRoundDialogView {...props} dependencies={{ slug: useWorkspaceSlug() }} />;
}

// ── 标记完成 dialog ──
// Complete-round dialog.

interface CompleteDialogProps {
  round: HumanInterviewRoundRecord | null;
  candidateId: string;
  onOpenChange: (open: boolean) => void;
  onCompleted: () => void;
}

function isHumanInterviewRoundOutcome(value: string): value is HumanInterviewRoundOutcome {
  return value in humanInterviewRoundOutcomeMeta;
}

export function CompleteRoundDialog({
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
      const trimmedFeedback = feedback.trim();
      if (!trimmedFeedback) {
        throw new Error("请填写面试评价");
      }
      return completeHumanInterviewRound(slug, candidateId, round.id, {
        feedback: trimmedFeedback,
        outcome,
        score: parsedScore,
      });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "标记完成失败"),
    onSuccess: () => {
      toast.success("已标记完成");
      void invalidateHumanInterviewCandidateQueries(queryClient, { candidateId, slug });
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
              onValueChange={(v) => {
                if (isHumanInterviewRoundOutcome(v)) {
                  setOutcome(v);
                }
              }}
              value={outcome}
            >
              {Object.keys(humanInterviewRoundOutcomeMeta)
                .filter(isHumanInterviewRoundOutcome)
                .map((v) => (
                  <div className="flex items-center gap-2" key={v}>
                    <RadioGroupItem id={`outcome-${v}`} value={v} />
                    <Label className="cursor-pointer text-sm" htmlFor={`outcome-${v}`}>
                      {humanInterviewRoundOutcomeMeta[v].label}
                    </Label>
                  </div>
                ))}
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
              反馈
            </Label>
            <Textarea
              id="round-feedback"
              maxLength={5000}
              onChange={(e) => setFeedback(e.target.value)}
              required
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

export function CancelRoundDialog({
  round,
  candidateId,
  onOpenChange,
  onCancelled,
}: CancelDialogProps) {
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
      void invalidateHumanInterviewCandidateQueries(queryClient, { candidateId, slug });
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
