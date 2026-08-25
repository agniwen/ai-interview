"use client";

import { useQuery } from "@tanstack/react-query";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import type {
  ResumePoolImportDuplicateMatchRecord,
  ResumePoolImportDuplicateResult,
  ResumePoolListRecord,
  ResumePoolUploaderOption,
} from "@arc/shared/resume-pool";
import { formatDateInAppTimeZone } from "@arc/shared/utils/time";

import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import { ResumeDuplicateMatchBadge } from "@/components/features/resume/resume-duplicate-match-badge";
import {
  buildStudioDateGroupedVirtualRows,
  groupStudioRecordsByCreatedAt,
  resolveStudioStickyDateGroupState,
} from "@/components/features/studio/studio-date-group-virtual-list";
import type {
  StudioDateGroup,
  StudioDateGroupedVirtualRow,
  StudioStickyDateHeaderPosition,
} from "@/components/features/studio/studio-date-group-virtual-list";
import { Badge } from "@/components/ui/badge";
import { rpcFetch } from "@/lib/client/api";
import type { DedupMatchRecord } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

type ResumePoolSourceFilter = "all" | "non_referral" | "referral";

export type ResumePoolCreatedAtRange =
  | ""
  | "today"
  | "yesterday"
  | "last_7_days"
  | `custom:${string}:${string}`;

export interface ResumePoolCreatedAtBounds {
  from: string;
  to: string;
}

export const RESUME_POOL_UPLOADER_QUERY_FRESHNESS = {
  refetchOnMount: "always",
  staleTime: 0,
} as const;

export const RESUME_POOL_LOAD_MORE_ROOT_MARGIN = "720px 0px";

export type ResumePoolFilters = Record<
  "createdAtRange" | "importStatus" | "uploaderIds",
  string
> & {
  sourceType: ResumePoolSourceFilter;
};

export type ResumePoolDateGroup = StudioDateGroup<ResumePoolListRecord>;
export type ResumePoolVirtualRow = StudioDateGroupedVirtualRow<ResumePoolListRecord>;
export type ResumePoolStickyHeaderPosition = StudioStickyDateHeaderPosition;

export function createResumePoolFilters(): ResumePoolFilters {
  return {
    createdAtRange: "",
    importStatus: "",
    sourceType: "all",
    uploaderIds: "",
  };
}

export function buildResumePoolUploaderFilterOptions(uploaders: ResumePoolUploaderOption[]) {
  const options = uploaders.map((uploader) => ({
    avatarUrl: uploader.image,
    label: uploader.name,
    searchValue: `${uploader.name} ${uploader.email}`,
    value: uploader.id,
  }));
  return options;
}

export function getCandidateTitle(record: ResumePoolListRecord) {
  return record.candidateName?.trim() || "未命名候选人";
}

export function getCandidateTitleWithId(record: ResumePoolListRecord) {
  const candidateTitle = getCandidateTitle(record);
  return formatResumeCandidateTitle(candidateTitle, record.id);
}

export function resumeParseStatusBadge(record: ResumePoolListRecord) {
  return record.resumeParseStatus === "failed" ? (
    <Badge variant="destructive">解析失败</Badge>
  ) : null;
}

export function resumeRecruitingStatusBadge(record: ResumePoolListRecord) {
  return record.importedResumeRecordId ? <Badge variant="success">已在招聘流程</Badge> : null;
}

export function duplicateMatchBadge(record: ResumePoolListRecord, onClick?: () => void) {
  if (!record.duplicateMatch) {
    return null;
  }
  return (
    <ResumeDuplicateMatchBadge
      displayMode="recruiting-entry"
      duplicateMatch={record.duplicateMatch}
      onClick={onClick}
    />
  );
}

export function getResumePoolImportActionState(record: ResumePoolListRecord) {
  if (record.importedResumeRecordId) {
    return {
      disabled: false,
      label: "再次创建招聘记录",
      loading: false,
    };
  }

  switch (record.resumeParseStatus) {
    case "ready": {
      return {
        disabled: false,
        label: "创建招聘记录",
        loading: false,
      };
    }
    case "queued": {
      return {
        disabled: true,
        label: "排队中",
        loading: true,
      };
    }
    case "processing": {
      return {
        disabled: true,
        label: "解析中",
        loading: true,
      };
    }
    case "failed": {
      return {
        disabled: true,
        label: "解析失败",
        loading: false,
      };
    }
    case "unparsed": {
      return {
        disabled: true,
        label: "未解析",
        loading: false,
      };
    }
    default: {
      return {
        disabled: true,
        label: "未解析",
        loading: false,
      };
    }
  }
}

export function canUploadToResumePool(canCreatePool: boolean, canCreateBatch: boolean) {
  return canCreatePool && canCreateBatch;
}

export function canImportResumePoolToLibrary(canImportPool: boolean, canCreateLibrary: boolean) {
  return canImportPool && canCreateLibrary;
}

export function matchesSearch(record: ResumePoolListRecord, rawSearch: string) {
  const search = rawSearch.trim().toLowerCase();
  if (!search) {
    return true;
  }
  return [
    record.candidateName,
    record.candidateEmail,
    record.candidatePhone,
    record.resumeFileName,
    record.targetRole,
  ]
    .filter(Boolean)
    .some((value) => value?.toLowerCase().includes(search));
}

export function sourceLabel(record: ResumePoolListRecord) {
  if (record.sourceChannel === "referral") {
    return "内推";
  }
  if (record.sourceChannel === "mail_ingest") {
    return "邮箱推送";
  }
  if (record.scope === "private") {
    return "—";
  }
  return record.sourcePoolItemId ? "私有简历推送" : "公共上传";
}

export function uploaderUserLabel(record: ResumePoolListRecord) {
  return record.uploaderName?.trim() || record.uploaderEmail?.trim() || "未知上传人";
}

export function uploaderMetaSegments(record: ResumePoolListRecord) {
  const createdAt = formatDateInAppTimeZone(record.createdAt, "YY年MM月DD日:HH:mm");
  const userName = uploaderUserLabel(record);
  if (record.sourceChannel === "referral") {
    return { leadingText: "", trailingText: `${createdAt} 内推`, userName };
  }
  if (record.sourceChannel === "mail_ingest") {
    return { leadingText: `${createdAt} 扫描`, trailingText: "邮箱录入", userName };
  }
  return { leadingText: "", trailingText: `${createdAt} 上传`, userName };
}

export function uploaderMetaLabel(record: ResumePoolListRecord) {
  const { leadingText, trailingText, userName } = uploaderMetaSegments(record);
  if (record.sourceChannel === "mail_ingest") {
    return `${leadingText}${userName}${trailingText}`;
  }
  return `${userName} ${trailingText}`;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function dateKeyInAppTimeZone(value: string | Date) {
  return formatDateInAppTimeZone(value, "YYYY-MM-DD");
}

function formatCreatedAtRangeDate(date: string) {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

function customCreatedAtRange(value: string): ResumePoolCreatedAtBounds | null {
  const match = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/u.exec(value);
  if (!match) {
    return null;
  }
  const [, from, to] = match;
  return isCalendarDate(from) && isCalendarDate(to) && from <= to ? { from, to } : null;
}

export function resumePoolCreatedAtBounds(
  value: string,
  now: Date = new Date(),
): ResumePoolCreatedAtBounds | null {
  if (value === "") {
    return null;
  }
  const today = dateKeyInAppTimeZone(now);
  if (value === "today") {
    return { from: today, to: today };
  }
  if (value === "yesterday") {
    const yesterday = addCalendarDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (value === "last_7_days") {
    return { from: addCalendarDays(today, -6), to: today };
  }
  return customCreatedAtRange(value);
}

export function resumePoolCreatedAtRangeLabel(value: string): string {
  if (value === "today") {
    return "今天";
  }
  if (value === "yesterday") {
    return "昨天";
  }
  if (value === "last_7_days") {
    return "最近 7 天";
  }
  const range = customCreatedAtRange(value);
  if (!range) {
    return "加入时间";
  }
  return `${formatCreatedAtRangeDate(range.from)}–${formatCreatedAtRangeDate(range.to)}`;
}

export function sourceActorLabel(record: ResumePoolListRecord) {
  return record.sourceChannel === "referral" ? "内推人" : "上传人";
}

export function canDeletePoolRecord(
  record: ResumePoolListRecord,
  {
    currentOrganizationId,
    currentUserId,
  }: {
    currentOrganizationId: string | null;
    currentUserId: string | null;
  },
) {
  return Boolean(
    currentOrganizationId &&
    currentUserId &&
    record.organizationId === currentOrganizationId &&
    record.createdBy === currentUserId,
  );
}

export function deletePoolRecordLabel(record: ResumePoolListRecord | null) {
  return record?.scope === "public" ? "人才库简历" : "私有简历";
}

export function sessionUserId(session: { user?: { id?: string | null } } | null | undefined) {
  return session?.user?.id ?? null;
}

export function pruneSelectedPrivateResumeIds(
  current: Set<string>,
  scope: ResumePoolScope,
  visibleRecordIds: string[],
) {
  if (current.size === 0) {
    return current;
  }
  if (scope !== "private") {
    return new Set<string>();
  }

  const visibleIds = new Set(visibleRecordIds);
  const next = new Set([...current].filter((id) => visibleIds.has(id)));
  return next.size === current.size ? current : next;
}

export function updateSelectedPrivateResumeIds(
  current: Set<string>,
  id: string,
  selected: boolean,
) {
  const next = new Set(current);
  if (selected) {
    next.add(id);
  } else {
    next.delete(id);
  }
  return next;
}

export function removeSelectedPrivateResumeId(current: Set<string>, id: string) {
  if (!current.has(id)) {
    return current;
  }
  const next = new Set(current);
  next.delete(id);
  return next;
}

export function sortPoolRecords(
  records: ResumePoolListRecord[],
  sortBy: string | undefined,
  sortOrder: "asc" | "desc" | undefined,
) {
  const direction = sortOrder === "asc" ? 1 : -1;
  const sorted = [...records];
  sorted.sort((a, b) => {
    if (sortBy === "candidateName") {
      return direction * getCandidateTitle(a).localeCompare(getCandidateTitle(b), "zh-CN");
    }
    const key = sortBy === "updatedAt" ? "updatedAt" : "createdAt";
    return direction * (new Date(a[key]).getTime() - new Date(b[key]).getTime());
  });
  return sorted;
}

export function groupResumePoolRecordsByCreatedAt(
  records: ResumePoolListRecord[],
  now: Date = new Date(),
): ResumePoolDateGroup[] {
  return groupStudioRecordsByCreatedAt(records, now);
}

export function buildResumePoolVirtualRows(
  records: ResumePoolListRecord[],
  sortBy: string | undefined,
  now: Date = new Date(),
): ResumePoolVirtualRow[] {
  return buildStudioDateGroupedVirtualRows(records, sortBy, now);
}

export function resolveResumePoolStickyState(
  positions: readonly ResumePoolStickyHeaderPosition[],
  stickyLine: number,
  headerHeight: number,
) {
  return resolveStudioStickyDateGroupState(positions, stickyLine, headerHeight);
}

export function filterPoolRecords(
  records: ResumePoolListRecord[],
  input: {
    filters: ResumePoolFilters;
    search: string;
    sortBy: string | undefined;
    sortOrder: "asc" | "desc" | undefined;
  },
) {
  const selectedUploaderIds = new Set(
    input.filters.uploaderIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );
  const filtered = records.filter((record) => {
    if (!matchesSearch(record, input.search)) {
      return false;
    }
    if (
      selectedUploaderIds.size > 0 &&
      (!record.createdBy || !selectedUploaderIds.has(record.createdBy))
    ) {
      return false;
    }
    if (input.filters.sourceType === "referral" && record.sourceChannel !== "referral") {
      return false;
    }
    if (input.filters.sourceType === "non_referral" && record.sourceChannel === "referral") {
      return false;
    }
    if (input.filters.importStatus === "imported" && !record.importedResumeRecordId) {
      return false;
    }
    if (input.filters.importStatus === "not_imported" && record.importedResumeRecordId) {
      return false;
    }
    return true;
  });
  return sortPoolRecords(filtered, input.sortBy, input.sortOrder);
}

export function useJobDescriptions(slug: string) {
  return useQuery({
    queryFn: async () => {
      const payload = await rpcFetch<{ records: JobDescriptionListRecord[] }>(
        rpc.api.w[":slug"].studio["job-descriptions"].recruiting.$get({
          param: { slug },
        }),
        "加载在招岗位列表失败",
      );
      return payload.records;
    },
    queryKey: ["job-descriptions", "recruiting", slug],
    staleTime: 60_000,
  });
}

export function buildJdOptions(records: JobDescriptionListRecord[]) {
  return records.map((jd) => ({
    description: jd.departmentName ?? undefined,
    label: jd.departmentName ? `${jd.departmentName} / ${jd.name}` : jd.name,
    value: jd.id,
  }));
}

export function toResumeDedupMatches(
  result: ResumePoolImportDuplicateResult | null,
): DedupMatchRecord[] {
  return (result?.matches ?? []).map((match: ResumePoolImportDuplicateMatchRecord) => ({
    candidateEmail: match.candidateEmail,
    candidateName: match.candidateName,
    candidatePhone: match.candidatePhone,
    conflictingSignals: match.conflictingSignals,
    createdAt: match.createdAt,
    id: match.id,
    jobDescriptionName: match.jobDescriptionName,
    level: match.level,
    resumeProfileSnapshot: match.resumeProfileSnapshot,
    score: match.score,
    semanticReasons: match.semanticReasons,
    similarity: match.similarity,
    skills: match.skills,
    status: match.status,
    targetRole: match.targetRole,
  }));
}
