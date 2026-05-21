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
  CalendarIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  MapPinIcon,
  PlusIcon,
  UsersIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  humanInterviewFormatMeta,
  humanInterviewRoundOutcomeMeta,
} from "@arc/db-schema/studio-interviews";
import type {
  HumanInterviewFormat,
  HumanInterviewRoundOutcome,
} from "@arc/db-schema/studio-interviews";
import type { HumanInterviewRoundRecord } from "@/lib/shared/studio-pipeline-stages";
import {
  cancelHumanInterviewRound,
  completeHumanInterviewRound,
  createHumanInterviewRound,
  listHumanInterviewRounds,
} from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";
import { rpcFetch } from "@/lib/client/api/rpc-fetch";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export function HumanInterviewStagePanel({ candidateId, candidateName, disabled }: PanelProps) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { data: rounds = [], isLoading } = useQuery({
    queryFn: () => listHumanInterviewRounds(slug, candidateId),
    queryKey: ["human-interview-rounds", slug, candidateId],
  });

  function invalidateRounds() {
    void queryClient.invalidateQueries({
      queryKey: ["human-interview-rounds", slug, candidateId],
    });
    // 顶级简历库列表也要刷新（进度列依赖派生聚合）。
    // The resume library progress column depends on aggregated counts.
    void queryClient.invalidateQueries({ queryKey: ["studio-resumes"] });
  }

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<HumanInterviewRoundRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<HumanInterviewRoundRecord | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium text-sm">真人复面进度</h3>
          <p className="text-muted-foreground text-xs">
            管理 {candidateName} 的真人复面：安排时间 / 录入面试官 / 标记结果。
          </p>
        </div>
        {disabled ? null : (
          <Button onClick={() => setScheduleOpen(true)} size="sm">
            <PlusIcon className="size-4" />
            新建一轮
          </Button>
        )}
      </div>

      {/* oxlint-disable-next-line no-nested-ternary -- three-state body: loading / empty / list. */}
      {isLoading ? (
        <div className="rounded-lg border border-border/60 bg-muted/30 p-6 text-center text-muted-foreground text-sm">
          加载中…
        </div>
      ) : (rounds.length === 0 ? (
        <Empty className="border-border/60">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersIcon className="size-5" />
            </EmptyMedia>
            <EmptyTitle>尚未安排真人复面</EmptyTitle>
            <EmptyDescription>
              {disabled
                ? "已结案候选人不可新增复面，请先重新激活。"
                : "点「新建一轮」开始安排第一次复面。"}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => (
            <RoundCard
              disabled={disabled}
              key={round.id}
              onCancel={() => setCancelTarget(round)}
              onComplete={() => setCompleteTarget(round)}
              round={round}
            />
          ))}
        </div>
      ))}

      <ScheduleRoundDialog
        candidateId={candidateId}
        existingCount={rounds.length}
        onOpenChange={setScheduleOpen}
        onScheduled={invalidateRounds}
        open={scheduleOpen}
      />
      <CompleteRoundDialog
        candidateId={candidateId}
        onCompleted={invalidateRounds}
        onOpenChange={(open) => !open && setCompleteTarget(null)}
        round={completeTarget}
      />
      <CancelRoundDialog
        candidateId={candidateId}
        onCancelled={invalidateRounds}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        round={cancelTarget}
      />
    </div>
  );
}

// 单轮卡片：展示该轮信息 + 行动按钮（pending 才有）。
// Single round card; action buttons appear only when status='pending'.
function RoundCard({
  round,
  disabled,
  onComplete,
  onCancel,
}: {
  round: HumanInterviewRoundRecord;
  disabled?: boolean;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const statusBadge = describeRoundStatus(round);

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">
              第 {round.sortOrder + 1} 轮 · {round.label}
            </span>
            <Badge variant={statusBadge.tone}>{statusBadge.label}</Badge>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
            {round.scheduledAt ? (
              <span className="inline-flex items-center gap-1">
                <CalendarIcon className="size-3" />
                {formatDateTime(round.scheduledAt)}
              </span>
            ) : (
              <span className="text-muted-foreground/70">时间未定</span>
            )}
            <span className="inline-flex items-center gap-1">
              {humanInterviewFormatMeta[round.format].label}
              {round.format === "onsite" && round.location ? (
                <>
                  <MapPinIcon className="ml-1 size-3" />
                  {round.location}
                </>
              ) : null}
              {round.format === "online" && round.meetingUrl ? (
                <a
                  className="ml-1 inline-flex items-center gap-0.5 underline-offset-2 hover:underline"
                  href={round.meetingUrl}
                  rel="noopener"
                  target="_blank"
                >
                  会议链接
                  <ExternalLinkIcon className="size-3" />
                </a>
              ) : null}
            </span>
            <span className="inline-flex items-center gap-1">
              <UsersIcon className="size-3" />
              {round.interviewers.map((i) => i.name).join("、") || "未指派面试官"}
            </span>
          </div>
        </div>
        {round.status === "pending" && !disabled ? (
          <div className="flex gap-2">
            <Button onClick={onComplete} size="sm" variant="outline">
              <CheckCircle2Icon className="size-4" />
              标记完成
            </Button>
            <Button onClick={onCancel} size="sm" variant="outline">
              <BanIcon className="size-4" />
              取消
            </Button>
          </div>
        ) : null}
      </div>

      {hasRoundDetails(round) ? (
        <div className="mt-3 space-y-1 border-border/40 border-t pt-3 text-sm">
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
    </div>
  );
}

function describeRoundStatus(round: HumanInterviewRoundRecord): {
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
  // pending
  return { label: round.scheduledAt ? "已安排" : "待安排", tone: "info" };
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
  const { data: members } = useWorkspaceMembers();
  const [label, setLabel] = useState("");
  const [format, setFormat] = useState<HumanInterviewFormat>("online");
  const [scheduledAt, setScheduledAt] = useState("");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [location, setLocation] = useState("");
  const [interviewerIds, setInterviewerIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  function reset() {
    setLabel("");
    setFormat("online");
    setScheduledAt("");
    setMeetingUrl("");
    setLocation("");
    setInterviewerIds([]);
    setNotes("");
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      reset();
    }
    onOpenChange(next);
  }

  const mutation = useMutation({
    mutationFn: () =>
      createHumanInterviewRound(slug, candidateId, {
        format,
        interviewerIds,
        label: label.trim() || defaultRoundLabel(existingCount),
        location: format === "onsite" ? location.trim() || null : null,
        meetingUrl: format === "online" ? meetingUrl.trim() || null : null,
        notes: notes.trim() || null,
        scheduledAt: scheduledAt || null,
      }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "创建失败"),
    onSuccess: () => {
      toast.success("已安排新一轮真人复面");
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
            填好基础信息后保存。面试官至少 1 位；时间可以暂不填，后续再补。
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
            <Label className="text-sm">面试形式</Label>
            <RadioGroup
              className="grid grid-cols-3 gap-2"
              onValueChange={(v) => setFormat(v as HumanInterviewFormat)}
              value={format}
            >
              {(Object.keys(humanInterviewFormatMeta) as HumanInterviewFormat[]).map((v) => (
                <div className="flex items-center gap-2" key={v}>
                  <RadioGroupItem id={`format-${v}`} value={v} />
                  <Label className="cursor-pointer text-sm" htmlFor={`format-${v}`}>
                    {humanInterviewFormatMeta[v].label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {format === "online" ? (
            <div className="grid gap-1.5">
              <Label className="text-sm" htmlFor="meeting-url">
                会议链接（可选）
              </Label>
              <Input
                id="meeting-url"
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://..."
                value={meetingUrl}
              />
            </div>
          ) : null}
          {format === "onsite" ? (
            <div className="grid gap-1.5">
              <Label className="text-sm" htmlFor="onsite-location">
                地点（可选）
              </Label>
              <Input
                id="onsite-location"
                onChange={(e) => setLocation(e.target.value)}
                placeholder="如 上海办公室 3F"
                value={location}
              />
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="scheduled-at">
              面试时间（可选）
            </Label>
            <Input
              id="scheduled-at"
              onChange={(e) => setScheduledAt(e.target.value)}
              type="datetime-local"
              value={scheduledAt}
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
            disabled={
              mutation.isPending ||
              interviewerIds.length === 0 ||
              (!label.trim() && existingCount === 0 && false)
            }
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
            录入面试结果。完成后只能修改评分和反馈，不能改时间或面试官。
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
            取消后该轮不会算入复面统计；如想保留为「已完成」请改走「标记完成」流程。
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
