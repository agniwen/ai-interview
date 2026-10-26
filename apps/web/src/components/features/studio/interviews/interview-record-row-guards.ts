import { pipelineStageMeta } from "@app/db-schema/studio-interviews";
import type {
  StudioAiInterviewRecordListRecord,
  StudioInterviewRecordListRecord,
} from "@app/shared/studio-interview-rounds";

// 只对 AI 行生效的行级回调；真人行在本页只读，返回兜底值。
// Row callbacks that only apply to AI rows; human rows are read-only here.
export function aiOnly<T>(
  fn: (row: StudioAiInterviewRecordListRecord) => T,
  fallback: T,
): (row: StudioInterviewRecordListRecord) => T {
  return (row) => (row.kind === "ai" ? fn(row) : fallback);
}

/** 只对 AI 行执行的操作；真人行忽略。/ Row action that only runs for AI rows. */
export function aiAction(
  fn: (row: StudioAiInterviewRecordListRecord) => void | Promise<void>,
): (row: StudioInterviewRecordListRecord) => void {
  return (row) => {
    if (row.kind === "ai") {
      void fn(row);
    }
  };
}

export function isAiRecord(
  row: StudioInterviewRecordListRecord,
): row is StudioAiInterviewRecordListRecord {
  return row.kind === "ai";
}

// AI 阶段锁：候选人推进到真人面试/Offer/已结束后，AI初面相关写动作禁用。
// AI-stage lock: once the candidate moves past ai_interview, AI round write actions are disabled.
export function isAiStageLocked(row: StudioAiInterviewRecordListRecord): boolean {
  return row.pipelineStage !== "screening" && row.pipelineStage !== "ai_interview";
}

export function aiStageLockedReason(row: StudioAiInterviewRecordListRecord): string | null {
  if (!isAiStageLocked(row)) {
    return null;
  }
  return `候选人已进入「${pipelineStageMeta[row.pipelineStage].label}」阶段，AI初面相关操作已锁定。如需修改请先回退阶段或重新激活。`;
}

// 已结束的轮次不再允许编辑。Completed rounds are read-only.
export function isRoundEditLocked(row: StudioAiInterviewRecordListRecord): boolean {
  return isAiStageLocked(row) || row.status === "completed";
}

export function roundEditLockedReason(row: StudioAiInterviewRecordListRecord): string | null {
  if (isAiStageLocked(row)) {
    return aiStageLockedReason(row);
  }
  return row.status === "completed" ? "面试已结束，不可编辑。" : null;
}
