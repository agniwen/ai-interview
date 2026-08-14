import type { DatasetRecord } from "@mastra/client-js";

export const EXPERIMENT_STATUS_OPTIONS = [
  { label: "全部状态", value: "all" },
  { label: "已完成", value: "completed" },
  { label: "运行中", value: "running" },
  { label: "失败", value: "failed" },
  { label: "等待中", value: "pending" },
] as const;

const EXPERIMENT_STATUS_LABELS: Readonly<Record<string, string>> = {
  completed: "已完成",
  failed: "失败",
  pending: "等待中",
  running: "运行中",
};

const EXPERIMENT_TARGET_TYPE_LABELS: Readonly<Record<string, string>> = {
  agent: "智能体",
  processor: "处理器",
  scorer: "评分器",
  workflow: "工作流",
};

export function getExperimentStatusLabel(status: string | null | undefined): string {
  if (!status) {
    return "—";
  }
  return EXPERIMENT_STATUS_LABELS[status] ?? status;
}

export function getExperimentTargetTypeLabel(targetType: string | null | undefined): string {
  if (!targetType) {
    return "—";
  }
  return EXPERIMENT_TARGET_TYPE_LABELS[targetType] ?? targetType;
}

export function getExperimentDatasetOptions(datasets?: DatasetRecord[]) {
  return [
    { label: "全部数据集", value: "all" },
    ...(datasets ?? []).map((ds) => ({ label: ds.name, value: ds.id })),
  ];
}
