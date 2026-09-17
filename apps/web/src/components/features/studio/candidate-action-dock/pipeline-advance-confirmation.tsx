import { useRef, useState } from "react";
import { pipelineStageMeta } from "@app/db-schema/studio-interviews";
import type { PipelineStage } from "@app/db-schema/studio-interviews";
import { Button } from "@/components/ui/button";
import { ActionFlowSurface } from "./action-flow-surface";
import { useActionFlowCompletion, useCandidateActionFlow } from "./candidate-action-dock";

export function usePipelineAdvanceConfirmation(stage: PipelineStage) {
  const flow = useCandidateActionFlow("advance-pipeline");
  const complete = useActionFlowCompletion("advance-pipeline");
  const [target, setTarget] = useState<PipelineStage | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setError] = useState<string | null>(null);
  const operation = useRef<(() => Promise<void>) | null>(null);
  const submitting = useRef(false);
  const label = target ? pipelineStageMeta[target].label : "下一阶段";
  let description = `确认将候选人从「${pipelineStageMeta[stage].label}」推进到「${label}」？`;
  if (stage === "screening") {
    description = `确认通过简历筛选并进入「${label}」？面试排期将在进入阶段后单独安排。`;
  }
  if (stage === "second_interview" && target === "final_interview") {
    description = "确认直接进入终试？此操作会将复试节点记录为跳过。";
  }

  async function confirm() {
    if (submitting.current || !operation.current) {
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation.current();
      complete(`已进入${label}`);
      flow.setOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : "推进失败，请重试");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return {
    request(next: PipelineStage, onConfirm: () => Promise<void>) {
      if (submitting.current) {
        return;
      }
      operation.current = onConfirm;
      setTarget(next);
      setError(null);
      flow.setOpen(true);
    },
    surface: (
      <ActionFlowSurface
        flowId="advance-pipeline"
        open={flow.open}
        onOpenChange={flow.setOpen}
        busy={busy}
        error={submitError}
        title={`确认进入${label}`}
        description={description}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => flow.setOpen(false)}>
              取消
            </Button>
            <Button disabled={busy} onClick={confirm}>
              {busy ? "推进中…" : "确认推进"}
            </Button>
          </>
        }
      >
        {null}
      </ActionFlowSurface>
    ),
  };
}
