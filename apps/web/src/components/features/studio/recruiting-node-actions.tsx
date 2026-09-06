import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { recruitingNodeStatusMeta } from "@app/db-schema/studio-interviews";
import type { RecruitingNodeStatus } from "@app/db-schema/schema";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { transitionInterviewRecord } from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import { RecruitingActionButton as Button } from "./recruiting-action-button";
import { LazyMarkdownEditor as MarkdownEditor } from "@/components/features/markdown-editor/lazy-markdown-editor";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";

type ProgressOptions = Partial<
  Record<
    ResumeLibraryDetail["pipelineStage"],
    Exclude<RecruitingNodeStatus, "inactive" | "skipped">[]
  >
>;
const progressOptions = {
  background_check: ["pending", "in_progress", "awaiting_review"],
  income_proof: ["pending", "in_progress", "awaiting_review"],
  offer: ["pending", "negotiating", "awaiting_send"],
  onboarding: ["pending", "in_progress"],
  screening: ["pending", "awaiting_review"],
} satisfies ProgressOptions;

export function getRecruitingProgressOptions(
  stage: ResumeLibraryDetail["pipelineStage"],
  currentStatus?: RecruitingNodeStatus,
): Exclude<RecruitingNodeStatus, "inactive" | "skipped">[] {
  if (
    currentStatus === "completed" ||
    (stage === "offer" && currentStatus === "awaiting_response")
  ) {
    return [];
  }
  if (stage in progressOptions) {
    // SAFETY: 上面的成员检查已确认 stage 是该固定配置的键。
    return progressOptions[stage as keyof typeof progressOptions];
  }
  return [];
}

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
  return "通过";
}

export const recruitingNodeActionLabels = {
  ai_interview: "确认 AI 初面结果",
  background_check: "确认背调结果",
  closed: "查看结束结果",
  final_interview: "确认终试结果",
  income_proof: "审核薪资流水",
  offer: "更新 Offer 协商进度",
  onboarding: "确认入职结果",
  screening: "确认简历筛选结果",
  second_interview: "确认复试结果",
} satisfies Record<ResumeLibraryDetail["pipelineStage"], string>;

/** 面试结果必须来自已结束、待确认的有效轮次。 */
export function canConfirmRecruitingNode(
  stage: ResumeLibraryDetail["pipelineStage"],
  node?: {
    effectiveAiRoundId: string | null;
    effectiveHumanRoundId?: string | null;
    status: RecruitingNodeStatus;
  },
) {
  if (stage === "closed" || stage === "screening") {
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

/** 人工确认只更新当前有效节点；安排面试、发 Offer 仍使用各自的业务操作。 */
export function RecruitingNodeActions({ record }: { record: ResumeLibraryDetail }) {
  const slug = useWorkspaceSlug();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const node = record.nodeStates.find((state) => state.node === record.pipelineStage);
  const [status, setStatus] = useState(node?.status ?? "pending");
  const mutation = useMutation({
    mutationFn: async (result: "pass" | "fail" | null) => {
      if (record.pipelineStage === "closed") {
        return;
      }
      if (result !== null && !reason.trim()) {
        throw new Error("请填写说明");
      }
      const targetStatus = result
        ? "completed"
        : getRecruitingProgressOptions(record.pipelineStage, node?.status).find(
            (value) => value === status,
          );
      if (!targetStatus) {
        throw new Error("当前状态不可修改，请刷新后重试");
      }
      await transitionInterviewRecord(slug, record.id, {
        action: "update_node",
        effectiveAiRoundId: node?.effectiveAiRoundId,
        effectiveHumanRoundId: node?.effectiveHumanRoundId,
        effectiveOfferId: node?.effectiveOfferId,
        expectedVersion: record.version,
        node: record.pipelineStage,
        reason: reason.trim() || undefined,
        result,
        targetStatus,
      });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "更新节点失败"),
    onSuccess: async () => {
      // 先关闭弹窗再刷新节点，避免完成状态卸载仍持有焦点锁的弹窗。
      setOpen(false);
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] }),
        queryClient.invalidateQueries({ queryKey: ["studio-resume-metrics", slug] }),
        queryClient.invalidateQueries({ queryKey: ["studio-resume-rounds", slug] }),
        queryClient.invalidateQueries({ queryKey: ["studio-interviews", slug] }),
      ]);
      toast.success("已保存");
    },
  });
  const canConfirm = canConfirmRecruitingNode(record.pipelineStage, node);
  const options = getRecruitingProgressOptions(record.pipelineStage, node?.status);
  return (
    <>
      {canConfirm && (
        <Button
          size="sm"
          variant="default"
          onClick={() => {
            setStatus(node?.status ?? "pending");
            setReason("");
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
        size="xl"
        bodyClassName="flex flex-col gap-4"
        footer={
          <>
            <Button
              variant="destructive"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate("fail")}
            >
              淘汰
            </Button>
            {options.length > 0 && (
              <Button
                variant={record.pipelineStage === "offer" ? "default" : "outline"}
                disabled={mutation.isPending}
                onClick={() => mutation.mutate(null)}
              >
                保存进度
              </Button>
            )}
            {record.pipelineStage !== "offer" && (
              <Button disabled={mutation.isPending} onClick={() => mutation.mutate("pass")}>
                {passLabel(record.pipelineStage)}
              </Button>
            )}
          </>
        }
      >
        {options.length > 0 && (
          <Select
            value={status}
            onValueChange={(selected) => {
              const next = options.find((value) => value === selected);
              if (next) {
                setStatus(next);
              }
            }}
            disabled={mutation.isPending}
          >
            <SelectTrigger aria-label="节点状态" className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {options.map((value) => (
                  <SelectItem key={value} value={value}>
                    {recruitingNodeStatusMeta[value].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        )}
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
