"use client";

/* oxlint-disable no-use-before-define -- helper components defined below export */
// 「标记结案」/「重新激活」二合一对话框。
//   - mode='close'：HR 选 outcome（录用/淘汰/撤回/归档）+ 可选的录用 / 淘汰细节
//   - mode='reactivate'：读 closedMeta.previousStage，把候选人恢复到上一个非 closed 阶段
// 内部 fetch 候选人详情（React Query 缓存复用 detail 面板的数据）拿到 closedMeta /
// candidate name；调用方只传 id 即可。
//
// Close & reactivate combined dialog. In close mode HR picks an outcome and
// fills outcome-specific details. In reactivate mode the dialog reads
// closedMeta.previousStage and restores the candidate there. Candidate detail
// is fetched via React Query and shares cache with the detail panel.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  candidateOutcomeMeta,
  closeCategoryMeta,
  closeCategoryValues,
  pipelineStageMeta,
} from "@arc/db-schema/studio-interviews";
import type {
  CandidateOutcome,
  ClosedMeta,
  CloseCategory,
  PipelineStage,
} from "@arc/db-schema/studio-interviews";
import type { ApiError } from "@/lib/client/api/errors";
import { fetchStudioResume, transitionInterviewRecord } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
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
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

// 结案可选的 4 个终态——in_pipeline 在 close 流程里不合法。
// The four terminal outcomes available when closing.
const CLOSE_OUTCOMES: Exclude<CandidateOutcome, "in_pipeline">[] = [
  "hired",
  "rejected",
  "withdrawn",
  "archived",
];

interface TransitionCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "close" | "reactivate";
  candidate: { id: string; candidateName: string | null } | null;
  // close 模式可以预设 outcome（例如 Offer 接受后弹「标记录用」）。
  // Pre-select an outcome in close mode (e.g., from offer accept flow).
  initialOutcome?: Exclude<CandidateOutcome, "in_pipeline">;
  onCompleted: () => void;
}

export function TransitionCandidateDialog(props: TransitionCandidateDialogProps) {
  const { open, mode, candidate } = props;
  if (mode === "reactivate") {
    return <ReactivateDialog {...props} candidate={candidate} open={open} />;
  }
  return <CloseDialog {...props} candidate={candidate} open={open} />;
}

// ── Close 模式 ──
// Close mode.

function CloseDialog({
  open,
  onOpenChange,
  candidate,
  initialOutcome,
  onCompleted,
}: Omit<TransitionCandidateDialogProps, "mode">) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

  // 拉详情用于 prefill hiredDetails（如果 Offer 已 accept 把 finalBaseSalary 等带进来）。
  // Fetch detail to prefill hiredDetails (e.g., final salary copied from accepted offer).
  const { data: resume } = useQuery({
    enabled: open && !!candidate?.id,
    queryFn: () => fetchStudioResume(slug, candidate?.id ?? ""),
    queryKey: ["studio-resumes", slug, "detail", candidate?.id],
  });

  const [outcome, setOutcome] = useState<Exclude<CandidateOutcome, "in_pipeline">>(
    initialOutcome ?? "rejected",
  );
  const [internalNotes, setInternalNotes] = useState("");
  const [feedbackToCandidate, setFeedbackToCandidate] = useState("");
  // 录用细节
  const [finalBaseSalary, setFinalBaseSalary] = useState("");
  const [finalPosition, setFinalPosition] = useState("");
  const [actualJoiningDate, setActualJoiningDate] = useState("");
  const [onboardingContact, setOnboardingContact] = useState("");
  // 淘汰细节
  const [category, setCategory] = useState<CloseCategory | "">("");
  const [talentPoolEligible, setTalentPoolEligible] = useState(false);
  const [revisitAfter, setRevisitAfter] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 打开对话框时根据 initialOutcome / 已有 Offer 信息预填。
  // Sync form on open; prefill from the latest accepted offer when present.
  useEffect(() => {
    if (!open) {
      return;
    }
    setOutcome(initialOutcome ?? "rejected");
    setInternalNotes("");
    setFeedbackToCandidate("");
    setFinalPosition("");
    setActualJoiningDate("");
    setOnboardingContact("");
    setCategory("");
    setTalentPoolEligible(false);
    setRevisitAfter("");
    setFinalBaseSalary("");
  }, [open, initialOutcome]);

  // outcome=hired 时把当前最新的 Offer base 带进来（HR 改完一键确认）。
  // When outcome=hired, prefill finalBaseSalary from accepted offer if any.
  useEffect(() => {
    if (!open || outcome !== "hired" || !resume) {
      return;
    }
    if (!finalBaseSalary) {
      // 不直接依赖 stageProgress.offer.latestDraft——它没有 baseSalary 字段，
      // 真正想要的是「最新的 accepted offer」，但 list 端只 list 了精简字段。
      // 短期方案：让 HR 自己填；后续如果觉得不爽再做一次 detail fetch。
      // No-op for now; HR types it. We could fetch the full offer list to fill
      // in the latest accepted base, but that's a separate enhancement.
    }
  }, [open, outcome, resume, finalBaseSalary]);

  async function handleConfirm() {
    if (!candidate) {
      return;
    }
    setSubmitting(true);
    try {
      // 构造 closedMeta partial。Build the closedMeta partial.
      const closedMeta: Omit<ClosedMeta, "previousStage"> = {
        feedbackToCandidate: feedbackToCandidate.trim() || null,
        internalNotes: internalNotes.trim() || null,
      };
      if (outcome === "hired") {
        const parsedSalary = finalBaseSalary === "" ? null : Number(finalBaseSalary);
        if (parsedSalary !== null && (Number.isNaN(parsedSalary) || parsedSalary < 0)) {
          throw new Error("最终薪资需为非负整数");
        }
        closedMeta.hiredDetails = {
          actualJoiningDate: actualJoiningDate || null,
          finalBaseSalary: parsedSalary,
          finalPosition: finalPosition.trim() || null,
          onboardingContact: onboardingContact.trim() || null,
        };
      }
      if (outcome === "rejected") {
        closedMeta.category = category || null;
        closedMeta.rejectionDetails = {
          revisitAfter: revisitAfter || null,
          talentPoolEligible,
        };
      }

      await transitionInterviewRecord(slug, candidate.id, {
        closedMeta,
        outcome,
        pipelineStage: "closed",
      });
      toast.success(`已标记为「${candidateOutcomeMeta[outcome].label}」`);
      // 详情面板缓存也刷一下，让 action bar 立刻显示「重新激活」。
      // Invalidate detail cache so the action bar swaps to "reactivate".
      await queryClient.invalidateQueries({
        queryKey: ["studio-resumes", slug, "detail", candidate.id],
      });
      onCompleted();
      onOpenChange(false);
    } catch (error) {
      const message =
        (error as ApiError | undefined)?.message ??
        (error instanceof Error ? error.message : "操作失败");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const candidateLabel = candidate?.candidateName || "该候选人";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>标记结案：{candidateLabel}</DialogTitle>
          <DialogDescription>
            选择候选人的最终结论。所在阶段会被同步置为「已结案」，便于人才库归类与统计。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <RadioGroup
            className="grid grid-cols-2 gap-2"
            onValueChange={(v) => setOutcome(v as Exclude<CandidateOutcome, "in_pipeline">)}
            value={outcome}
          >
            {CLOSE_OUTCOMES.map((value) => (
              <div className="flex items-center gap-2" key={value}>
                <RadioGroupItem id={`outcome-${value}`} value={value} />
                <Label className="cursor-pointer text-sm" htmlFor={`outcome-${value}`}>
                  {candidateOutcomeMeta[value].label}
                </Label>
              </div>
            ))}
          </RadioGroup>

          {outcome === "hired" ? (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label className="text-xs" htmlFor="hired-position">
                  最终职位（可选）
                </Label>
                <Input
                  id="hired-position"
                  maxLength={200}
                  onChange={(e) => setFinalPosition(e.target.value)}
                  placeholder="例如 高级前端 L4"
                  value={finalPosition}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor="hired-salary">
                  最终月薪 (¥，可选)
                </Label>
                <Input
                  id="hired-salary"
                  inputMode="numeric"
                  min={0}
                  onChange={(e) => setFinalBaseSalary(e.target.value)}
                  type="number"
                  value={finalBaseSalary}
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor="hired-joining">
                  实际入职日（可选）
                </Label>
                <Input
                  id="hired-joining"
                  onChange={(e) => setActualJoiningDate(e.target.value)}
                  type="date"
                  value={actualJoiningDate}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label className="text-xs" htmlFor="hired-contact">
                  入职对接人（可选）
                </Label>
                <Input
                  id="hired-contact"
                  maxLength={200}
                  onChange={(e) => setOnboardingContact(e.target.value)}
                  placeholder="HR 同事 / 业务对接人"
                  value={onboardingContact}
                />
              </div>
            </div>
          ) : null}

          {outcome === "rejected" ? (
            <div className="grid gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
              <div className="grid gap-1.5">
                <Label className="text-xs" htmlFor="reject-category">
                  淘汰原因分类（可选，用于统计）
                </Label>
                <NativeSelect
                  id="reject-category"
                  onChange={(e) => setCategory(e.target.value as CloseCategory)}
                  value={category}
                >
                  <NativeSelectOption value="">请选择</NativeSelectOption>
                  {closeCategoryValues.map((v) => (
                    <NativeSelectOption key={v} value={v}>
                      {closeCategoryMeta[v].label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
              <div className="flex items-center gap-2">
                <input
                  checked={talentPoolEligible}
                  className="size-4 accent-foreground"
                  id="talent-pool"
                  onChange={(e) => setTalentPoolEligible(e.target.checked)}
                  type="checkbox"
                />
                <Label className="cursor-pointer text-sm" htmlFor="talent-pool">
                  进入人才库（未来可召回）
                </Label>
              </div>
              {talentPoolEligible ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs" htmlFor="revisit-after">
                    建议多久后再联系（可选）
                  </Label>
                  <Input
                    id="revisit-after"
                    onChange={(e) => setRevisitAfter(e.target.value)}
                    type="date"
                    value={revisitAfter}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="close-feedback">
              对外反馈话术（可选，给候选人看）
            </Label>
            <Textarea
              id="close-feedback"
              maxLength={5000}
              onChange={(e) => setFeedbackToCandidate(e.target.value)}
              placeholder="例如：感谢您参与本次招聘流程……"
              rows={2}
              value={feedbackToCandidate}
            />
          </div>

          <div className="grid gap-1.5">
            <Label className="text-sm" htmlFor="close-notes">
              内部备注（可选）
            </Label>
            <Textarea
              id="close-notes"
              maxLength={5000}
              onChange={(e) => setInternalNotes(e.target.value)}
              placeholder="给团队看的真实反馈，不发给候选人"
              rows={2}
              value={internalNotes}
            />
          </div>
        </div>

        <DialogFooter>
          <Button disabled={submitting} onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button disabled={submitting || !candidate} onClick={handleConfirm}>
            {submitting ? "处理中…" : "确认结案"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reactivate 模式 ──
// Reactivate mode.

function ReactivateDialog({
  open,
  onOpenChange,
  candidate,
  onCompleted,
}: Omit<TransitionCandidateDialogProps, "mode" | "initialOutcome">) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();

  // 读 closedMeta.previousStage 决定回到哪个阶段；缺失就 fallback 到 ai_interview。
  // Read previousStage from closedMeta; fallback to ai_interview when missing.
  const { data: resume, isLoading } = useQuery({
    enabled: open && !!candidate?.id,
    queryFn: () => fetchStudioResume(slug, candidate?.id ?? ""),
    queryKey: ["studio-resumes", slug, "detail", candidate?.id],
  });
  const targetStage: PipelineStage = resume?.closedMeta?.previousStage ?? "ai_interview";

  const [submitting, setSubmitting] = useState(false);

  async function handleConfirm() {
    if (!candidate) {
      return;
    }
    setSubmitting(true);
    try {
      await transitionInterviewRecord(slug, candidate.id, {
        outcome: "in_pipeline",
        pipelineStage: targetStage,
      });
      toast.success(`已重新激活，回到「${pipelineStageMeta[targetStage].label}」`);
      await queryClient.invalidateQueries({
        queryKey: ["studio-resumes", slug, "detail", candidate.id],
      });
      onCompleted();
      onOpenChange(false);
    } catch (error) {
      const message =
        (error as ApiError | undefined)?.message ??
        (error instanceof Error ? error.message : "操作失败");
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  const candidateLabel = candidate?.candidateName || "该候选人";

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>重新激活：{candidateLabel}</DialogTitle>
          <DialogDescription>
            {isLoading ? (
              "正在加载阶段信息…"
            ) : (
              <>
                将从「已结案」恢复到「
                <span className="font-medium text-foreground">
                  {pipelineStageMeta[targetStage].label}
                </span>
                」阶段。已存在的轮次 / Offer 记录会保留。
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button disabled={submitting} onClick={() => onOpenChange(false)} variant="outline">
            取消
          </Button>
          <Button disabled={submitting || isLoading || !candidate} onClick={handleConfirm}>
            {submitting ? "处理中…" : "确认重新激活"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
