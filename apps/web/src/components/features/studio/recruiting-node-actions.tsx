import {
  useCandidateActionDock,
  useActionFlowCompletion,
  useCandidateActionFlow,
  useActionRecordVersion,
} from "./candidate-action-dock/candidate-action-dock";
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
import { ActionFlowSurface } from "./candidate-action-dock/action-flow-surface";

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
    return "填写转正工资；试用期工资和出国工资可按实际情况选填。确认通过后将直接进入发 Offer。";
  }
}

function parseAgreedBaseSalary(value: string) {
  const salary = Number(value);
  return Number.isInteger(salary) && salary > 0 ? salary : null;
}

function parseOptionalSalary(value: string) {
  if (!value.trim()) {
    return;
  }
  const salary = Number(value);
  return Number.isInteger(salary) && salary > 0 ? salary : null;
}

function buildSalaryNegotiationInput({
  agreedBaseSalary,
  expectedVersion,
  overseasSalary,
  probationSalary,
  reason,
  result,
}: {
  agreedBaseSalary: string;
  expectedVersion: number;
  overseasSalary: string;
  probationSalary: string;
  reason: string;
  result: "fail" | "pass";
}) {
  const salary = parseAgreedBaseSalary(agreedBaseSalary);
  const parsedOverseasSalary = parseOptionalSalary(overseasSalary);
  const parsedProbationSalary = parseOptionalSalary(probationSalary);
  if (result === "pass" && salary === null) {
    throw new Error("请填写大于 0 的转正工资");
  }
  if (result === "pass" && parsedProbationSalary === null) {
    throw new Error("试用期工资必须为大于 0 的整数");
  }
  if (result === "pass" && parsedOverseasSalary === null) {
    throw new Error("出国工资必须为大于 0 的整数");
  }
  return {
    action: "review_salary_negotiation" as const,
    agreedBaseSalary: result === "pass" ? (salary ?? undefined) : undefined,
    expectedVersion,
    overseasSalary:
      result === "pass" && parsedOverseasSalary !== null ? parsedOverseasSalary : undefined,
    probationSalary:
      result === "pass" && parsedProbationSalary !== null ? parsedProbationSalary : undefined,
    reason,
    result,
  };
}

function confirmationDisabledReason(
  stage: ResumeLibraryDetail["pipelineStage"],
  actualJoiningDate: string,
  agreedBaseSalary: string,
  overseasSalary: string,
  probationSalary: string,
) {
  if (stage === "onboarding" && !actualJoiningDate) {
    return "请填写到岗日期";
  }
  if (stage === "salary_negotiation" && parseAgreedBaseSalary(agreedBaseSalary) === null) {
    return "请填写转正工资";
  }
  if (stage === "salary_negotiation" && parseOptionalSalary(probationSalary) === null) {
    return "试用期工资必须为大于 0 的整数";
  }
  if (stage === "salary_negotiation" && parseOptionalSalary(overseasSalary) === null) {
    return "出国工资必须为大于 0 的整数";
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
  const dock = useCandidateActionDock();
  const complete = useActionFlowCompletion("review-node");
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const { open, setOpen } = useCandidateActionFlow("review-node");
  const expectedVersion = useActionRecordVersion(open, record.version);
  const [actualJoiningDate, setActualJoiningDate] = useState("");
  const [agreedBaseSalary, setAgreedBaseSalary] = useState("");
  const [overseasSalary, setOverseasSalary] = useState("");
  const [probationSalary, setProbationSalary] = useState("");
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
          expectedVersion: expectedVersion ?? record.version,
          reason: reason.trim(),
          result,
        });
        return;
      }
      if (record.pipelineStage === "salary_negotiation") {
        await transitionInterviewRecord(
          slug,
          record.id,
          buildSalaryNegotiationInput({
            agreedBaseSalary,
            expectedVersion: expectedVersion ?? record.version,
            overseasSalary,
            probationSalary,
            reason: reason.trim(),
            result,
          }),
        );
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
        expectedVersion: expectedVersion ?? record.version,
        node: record.pipelineStage,
        reason: reason.trim() || undefined,
        result,
        targetStatus: "completed",
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新节点失败"),
    onSuccess: async (_data, result) => {
      // 先关闭弹窗再刷新节点，避免完成状态卸载仍持有焦点锁的弹窗。
      complete(nodeReviewSuccessMessage(record.pipelineStage, result));
      setOpen(false);
      setAgreedBaseSalary("");
      setOverseasSalary("");
      setProbationSalary("");
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
            if (!open) {
              setReason(node?.reason ?? "");
              setActualJoiningDate("");
              setAgreedBaseSalary(
                record.candidateExpectationsMeta?.agreedBaseSalary
                  ? String(record.candidateExpectationsMeta.agreedBaseSalary)
                  : "",
              );
              setOverseasSalary(
                record.candidateExpectationsMeta?.overseasSalary
                  ? String(record.candidateExpectationsMeta.overseasSalary)
                  : "",
              );
              setProbationSalary(
                record.candidateExpectationsMeta?.probationSalary
                  ? String(record.candidateExpectationsMeta.probationSalary)
                  : "",
              );
            }
            setOpen(true);
          }}
        >
          {recruitingNodeActionLabels[record.pipelineStage]}
        </Button>
      )}
      <ActionFlowSurface
        flowId="review-node"
        busy={mutation.isPending}
        error={mutation.error?.message}
        open={open}
        onOpenChange={setOpen}
        title={recruitingNodeActionLabels[record.pipelineStage]}
        description={getNodeActionDescription(record.pipelineStage)}
        size="xl"
        bodyClassName="flex flex-col gap-4"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={mutation.isPending}
              onClick={() => {
                setOpen(false);
                mutation.reset();
              }}
            >
              放弃填写
            </Button>
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
                  overseasSalary,
                  probationSalary,
                )}
                disabled={
                  mutation.isPending ||
                  (record.pipelineStage === "onboarding" && !actualJoiningDate) ||
                  (record.pipelineStage === "salary_negotiation" &&
                    (parseAgreedBaseSalary(agreedBaseSalary) === null ||
                      parseOptionalSalary(probationSalary) === null ||
                      parseOptionalSalary(overseasSalary) === null))
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
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="salary-negotiation-probation-salary">试用期工资（可选）</Label>
              <Input
                aria-label="试用期工资"
                disabled={mutation.isPending}
                id="salary-negotiation-probation-salary"
                inputMode="numeric"
                min={1}
                onChange={(event) => setProbationSalary(event.target.value)}
                placeholder="如 24000"
                type="number"
                value={probationSalary}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="salary-negotiation-base-salary">转正工资（必填）</Label>
              <Input
                aria-label="转正工资"
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
            <div className="grid gap-1.5">
              <Label htmlFor="salary-negotiation-overseas-salary">出国工资（可选）</Label>
              <Input
                aria-label="出国工资"
                disabled={mutation.isPending}
                id="salary-negotiation-overseas-salary"
                inputMode="numeric"
                min={1}
                onChange={(event) => setOverseasSalary(event.target.value)}
                placeholder="如 35000"
                type="number"
                value={overseasSalary}
              />
            </div>
            <p className="text-muted-foreground text-xs sm:col-span-3">
              单位：元/月；转正工资将自动带入 Offer。
            </p>
          </div>
        ) : null}
        <MarkdownEditor
          minHeight={dock ? 100 : 240}
          className={
            dock
              ? "border-border/50 shadow-none [&_.ProseMirror]:text-[13px] [&_.ProseMirror_p]:my-1 [&_.ProseMirror_p]:leading-5"
              : undefined
          }
          aria-label="说明"
          placeholder="填写说明"
          value={reason}
          onChange={setReason}
          disabled={mutation.isPending}
        />
      </ActionFlowSurface>
    </>
  );
}
