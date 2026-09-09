import { DatePicker } from "@/components/date-time-picker";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RecruitingNodeStatus } from "@app/db-schema/schema";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { transitionInterviewRecord } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { RecruitingActionButton as Button } from "./recruiting-action-button";
import { LazyMarkdownEditor as MarkdownEditor } from "@/components/features/markdown-editor/lazy-markdown-editor";
import { Modal } from "@/components/ui/modal";

function passLabel(stage: ResumeLibraryDetail["pipelineStage"]) {
  if (stage === "ai_interview") {
    return "通过并继续";
  }
  if (stage === "onboarding") {
    return "确认入职";
  }
  if (stage === "screening") {
    return "合格";
  }
  if (stage === "income_proof") {
    return "通过并进入谈薪";
  }
  if (stage === "salary_negotiation") {
    return "确认并进入发 Offer";
  }
  return "通过";
}

function failLabel(stage: ResumeLibraryDetail["pipelineStage"]) {
  return stage === "income_proof" ? "驳回并结束" : "淘汰";
}

export const recruitingNodeActionLabels = {
  ai_interview: "确认 AI 初面结果",
  background_check: "确认背调结果",
  closed: "查看结束结果",
  final_interview: "确认终试结果",
  income_proof: "确认流水审核结果",
  offer: "更新 Offer 进度",
  onboarding: "确认入职结果",
  salary_negotiation: "确认谈薪结果",
  screening: "确认简历筛选结果",
  second_interview: "确认复试结果",
} satisfies Record<ResumeLibraryDetail["pipelineStage"], string>;

function getNodeActionDescription(stage: ResumeLibraryDetail["pipelineStage"]) {
  if (stage === "onboarding") {
    return "候选人已到岗时，填写到岗日期与说明并点击“确认入职”，完成招聘流程。";
  }
  if (stage === "income_proof") {
    return "核对薪资证明并填写审核说明；未提供材料时，请在说明中记录原因。审核通过后将直接进入谈薪。";
  }
  if (stage === "salary_negotiation") {
    return "填写双方最终谈定的税前 Base 月薪和确认说明。确认通过后将直接进入发 Offer。";
  }
}

function parseAgreedBaseSalary(value: string) {
  const salary = Number(value);
  return Number.isInteger(salary) && salary > 0 ? salary : null;
}

function confirmationDisabledReason(
  stage: ResumeLibraryDetail["pipelineStage"],
  actualJoiningDate: string,
  agreedBaseSalary: string,
) {
  if (stage === "onboarding" && !actualJoiningDate) {
    return "请填写到岗日期";
  }
  if (stage === "salary_negotiation" && parseAgreedBaseSalary(agreedBaseSalary) === null) {
    return "请填写谈定 Base 月薪";
  }
  return null;
}

function nodeReviewSuccessMessage(
  stage: ResumeLibraryDetail["pipelineStage"],
  result: "fail" | "pass",
) {
  if (result === "pass" && stage === "income_proof") {
    return "已进入谈薪";
  }
  if (result === "pass" && stage === "salary_negotiation") {
    return "已进入发 Offer";
  }
  return "已保存";
}

/** 面试结果必须来自已结束、待确认的有效轮次。 */
export function canConfirmRecruitingNode(
  stage: ResumeLibraryDetail["pipelineStage"],
  node?: {
    effectiveAiRoundId: string | null;
    effectiveHumanRoundId?: string | null;
    status: RecruitingNodeStatus;
  },
) {
  if (stage === "closed" || stage === "screening" || stage === "offer") {
    return false;
  }
  if (node?.status === "completed") {
    return false;
  }
  if (stage === "second_interview" || stage === "final_interview") {
    return Boolean(node?.effectiveHumanRoundId && node.status === "awaiting_review");
  }
  return (
    stage !== "ai_interview" ||
    Boolean(node?.effectiveAiRoundId && node.status === "awaiting_review")
  );
}

/** 人工确认当前有效节点的最终结果；业务进度由安排面试、发 Offer 等操作更新。 */
export function RecruitingNodeActions({ record }: { record: ResumeLibraryDetail }) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [actualJoiningDate, setActualJoiningDate] = useState("");
  const [agreedBaseSalary, setAgreedBaseSalary] = useState("");
  const [reason, setReason] = useState("");
  const node = record.nodeStates.find((state) => state.node === record.pipelineStage);
  const mutation = useMutation({
    mutationFn: async (result: "pass" | "fail") => {
      if (record.pipelineStage === "closed") {
        return;
      }
      if (!reason.trim()) {
        throw new Error("请填写说明");
      }
      if (record.pipelineStage === "income_proof") {
        await transitionInterviewRecord(slug, record.id, {
          action: "review_income_proof",
          expectedVersion: record.version,
          reason: reason.trim(),
          result,
        });
        return;
      }
      if (record.pipelineStage === "salary_negotiation") {
        const salary = parseAgreedBaseSalary(agreedBaseSalary);
        if (result === "pass" && salary === null) {
          throw new Error("请填写大于 0 的谈定 Base 月薪");
        }
        await transitionInterviewRecord(slug, record.id, {
          action: "review_salary_negotiation",
          agreedBaseSalary: result === "pass" ? (salary ?? undefined) : undefined,
          expectedVersion: record.version,
          reason: reason.trim(),
          result,
        });
        return;
      }
      await transitionInterviewRecord(slug, record.id, {
        action: "update_node",
        actualJoiningDate:
          record.pipelineStage === "onboarding" && result === "pass"
            ? actualJoiningDate
            : undefined,
        effectiveAiRoundId: node?.effectiveAiRoundId,
        effectiveHumanRoundId: node?.effectiveHumanRoundId,
        effectiveOfferId: node?.effectiveOfferId,
        expectedVersion: record.version,
        node: record.pipelineStage,
        reason: reason.trim() || undefined,
        result,
        targetStatus: "completed",
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新节点失败"),
    onSuccess: async (_data, result) => {
      // 先关闭弹窗再刷新节点，避免完成状态卸载仍持有焦点锁的弹窗。
      setOpen(false);
      setAgreedBaseSalary("");
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] }),
        queryClient.invalidateQueries({ queryKey: ["studio-resume-metrics", slug] }),
        queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds", slug] }),
        queryClient.invalidateQueries({ queryKey: ["studio-interviews", slug] }),
      ]);
      toast.success(nodeReviewSuccessMessage(record.pipelineStage, result));
    },
  });
  const canConfirm = canConfirmRecruitingNode(record.pipelineStage, node);
  return (
    <>
      {canConfirm && (
        <Button
          size="sm"
          variant="default"
          onClick={() => {
            setReason(node?.reason ?? "");
            setActualJoiningDate("");
            setAgreedBaseSalary(
              record.candidateExpectationsMeta?.agreedBaseSalary
                ? String(record.candidateExpectationsMeta.agreedBaseSalary)
                : "",
            );
            setOpen(true);
          }}
        >
          {recruitingNodeActionLabels[record.pipelineStage]}
        </Button>
      )}
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={recruitingNodeActionLabels[record.pipelineStage]}
        description={getNodeActionDescription(record.pipelineStage)}
        size="xl"
        bodyClassName="flex flex-col gap-4"
        footer={
          <>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("fail")}
            >
              {failLabel(record.pipelineStage)}
            </Button>
            {record.pipelineStage !== "offer" && (
              <Button
                disabledReason={confirmationDisabledReason(
                  record.pipelineStage,
                  actualJoiningDate,
                  agreedBaseSalary,
                )}
                disabled={
                  mutation.isPending ||
                  (record.pipelineStage === "onboarding" && !actualJoiningDate) ||
                  (record.pipelineStage === "salary_negotiation" &&
                    parseAgreedBaseSalary(agreedBaseSalary) === null)
                }
                onClick={() => mutation.mutate("pass")}
              >
                {passLabel(record.pipelineStage)}
              </Button>
            )}
          </>
        }
      >
        {record.pipelineStage === "onboarding" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="onboarding-actual-date">到岗日期</Label>
            <DatePicker
              id="onboarding-actual-date"
              aria-label="到岗日期"
              value={actualJoiningDate}
              onValueChange={setActualJoiningDate}
              disabled={mutation.isPending}
            />
          </div>
        ) : null}
        {record.pipelineStage === "salary_negotiation" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="salary-negotiation-base-salary">谈定 Base 月薪（税前）</Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground text-sm">
                ¥
              </span>
              <Input
                aria-label="谈定 Base 月薪"
                className="pl-7"
                disabled={mutation.isPending}
                id="salary-negotiation-base-salary"
                inputMode="numeric"
                min={1}
                onChange={(event) => setAgreedBaseSalary(event.target.value)}
                placeholder="如 28000"
                type="number"
                value={agreedBaseSalary}
              />
            </div>
            <p className="text-muted-foreground text-xs">单位：元/月，将自动带入 Offer。</p>
          </div>
        ) : null}
        <MarkdownEditor
          minHeight={240}
          aria-label="说明"
          placeholder="填写说明"
          value={reason}
          onChange={setReason}
          disabled={mutation.isPending}
        />
      </Modal>
    </>
  );
}
