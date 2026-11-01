import type { ComponentProps } from "react";

import type { Badge } from "@/components/ui/badge";

const countFormatter = new Intl.NumberFormat("zh-CN");

const JOB_STATE_OPTIONS = [
  { label: "全部状态", value: "all" },
  { label: "等待中", value: "waiting" },
  { label: "处理中", value: "active" },
  { label: "延迟中", value: "delayed" },
  { label: "失败", value: "failed" },
  { label: "已完成", value: "completed" },
  { label: "已暂停", value: "paused" },
  { label: "优先级", value: "prioritized" },
  { label: "等待子任务", value: "waiting-children" },
] as const;

const UPLOAD_STATUS_FILTER_OPTIONS = [
  { label: "全部上传状态", value: "all" },
  { label: "排队中", value: "pending" },
  { label: "处理中", value: "processing" },
  { label: "已完成", value: "succeeded" },
  { label: "失败", value: "failed" },
  { label: "已跳过", value: "duplicate_skipped" },
  { label: "已取消", value: "cancelled" },
] as const;

const PARSE_STATUS_FILTER_OPTIONS = [
  { label: "全部解析状态", value: "all" },
  { label: "待解析", value: "queued" },
  { label: "未解析", value: "unparsed" },
  { label: "解析中", value: "processing" },
  { label: "已解析", value: "ready" },
  { label: "解析失败", value: "failed" },
] as const;
export type JobStateFilter = (typeof JOB_STATE_OPTIONS)[number]["value"];
export type UploadStatusFilter = (typeof UPLOAD_STATUS_FILTER_OPTIONS)[number]["value"];
export type ParseStatusFilter = (typeof PARSE_STATUS_FILTER_OPTIONS)[number]["value"];

type BadgeVariant = ComponentProps<typeof Badge>["variant"];
interface StatusMeta {
  label: string;
  variant: BadgeVariant;
}

interface QueueJobData {
  batchId?: string;
  itemId?: string;
  jobDescriptionId?: string;
  resumeRecordId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

export function isQueueJobData(value: unknown): value is QueueJobData {
  return (
    isRecord(value) &&
    isOptionalString(value.itemId) &&
    isOptionalString(value.batchId) &&
    isOptionalString(value.resumeRecordId) &&
    isOptionalString(value.jobDescriptionId)
  );
}

export function formatCount(value: number): string {
  return countFormatter.format(value);
}

export function getInitials(name?: string | null, email?: string | null): string {
  const source = (name ?? email ?? "").trim();
  if (!source) {
    return "U";
  }
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ""}${words[1]?.[0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

export function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) {
    return "—";
  }
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (!Number.isFinite(ms) || ms < 0) {
    return "—";
  }
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export function stateLabel(state: string): string {
  return JOB_STATE_OPTIONS.find((option) => option.value === state)?.label ?? state;
}

export function normalizeStateFilter(value: string): JobStateFilter {
  return JOB_STATE_OPTIONS.find((option) => option.value === value)?.value ?? "all";
}

export function normalizeUploadStatusFilter(value: string): UploadStatusFilter {
  return UPLOAD_STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.value ?? "all";
}

export function normalizeParseStatusFilter(value: string): ParseStatusFilter {
  return PARSE_STATUS_FILTER_OPTIONS.find((option) => option.value === value)?.value ?? "all";
}

export function stateVariant(state: string): BadgeVariant {
  if (state === "completed") {
    return "success";
  }
  if (state === "failed") {
    return "danger";
  }
  if (state === "active") {
    return "info";
  }
  if (state === "delayed" || state === "waiting-children") {
    return "warning";
  }
  return "outline";
}

export function uploadItemStatusMeta(status: string, target: string): StatusMeta {
  if (status === "pending") {
    return { label: "排队中", variant: "outline" };
  }
  if (status === "processing") {
    return { label: "处理中", variant: "info" };
  }
  if (status === "succeeded") {
    return { label: target === "resume_pool" ? "已加入" : "已入库", variant: "success" };
  }
  if (status === "failed") {
    return { label: "失败", variant: "danger" };
  }
  if (status === "duplicate_skipped") {
    return { label: "已跳过", variant: "warning" };
  }
  if (status === "cancelled") {
    return { label: "已取消", variant: "outline" };
  }
  return { label: status || "未知", variant: "outline" };
}

export function resumeParseStatusMeta(status: string | null): StatusMeta {
  if (status === "ready") {
    return { label: "已解析", variant: "success" };
  }
  if (status === "processing") {
    return { label: "解析中", variant: "info" };
  }
  if (status === "failed") {
    return { label: "解析失败", variant: "danger" };
  }
  if (status === "queued" || status === "unparsed") {
    return { label: "未解析", variant: "outline" };
  }
  return { label: status || "—", variant: "outline" };
}

export function batchStatusMeta(status: string): StatusMeta {
  if (status === "running") {
    return { label: "运行中", variant: "info" };
  }
  if (status === "completed") {
    return { label: "已完成", variant: "success" };
  }
  if (status === "cancelled") {
    return { label: "已取消", variant: "outline" };
  }
  if (status === "pending") {
    return { label: "待开始", variant: "outline" };
  }
  return { label: status || "未知", variant: "outline" };
}

export function getJobDataSummary(data: QueueJobData | null): string {
  if (!data) {
    return "—";
  }
  const { batchId, itemId, jobDescriptionId, resumeRecordId } = data;
  if (itemId && batchId) {
    return `${itemId} / ${batchId}`;
  }
  if (resumeRecordId && jobDescriptionId) {
    return `${resumeRecordId} / ${jobDescriptionId}`;
  }
  return itemId ?? batchId ?? resumeRecordId ?? jobDescriptionId ?? "—";
}
