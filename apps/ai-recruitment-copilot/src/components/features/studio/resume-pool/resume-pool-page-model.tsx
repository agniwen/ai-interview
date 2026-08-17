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
import { Badge } from "@/components/ui/badge";
import { rpcFetch } from "@/lib/client/api";
import type { DedupMatchRecord } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

type ResumePoolSourceFilter = "all" | "non_referral" | "referral";

export const RESUME_POOL_UPLOADER_QUERY_FRESHNESS = {
  refetchOnMount: "always",
  staleTime: 0,
} as const;

export const RESUME_POOL_LOAD_MORE_ROOT_MARGIN = "720px 0px";

export type ResumePoolFilters = Record<"importStatus" | "uploaderIds", string> & {
  sourceType: ResumePoolSourceFilter;
};

export interface ResumePoolDateGroup {
  id: string;
  label: string;
  records: ResumePoolListRecord[];
}

export function createResumePoolFilters(): ResumePoolFilters {
  return {
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

export function formatCandidateWorkYears(workYears: number | null) {
  return workYears === null ? null : `${workYears}年`;
}

export function getCandidateDisplayTitle(record: ResumePoolListRecord) {
  const candidateTitle = getCandidateTitle(record);
  const targetRole = record.targetRole?.trim();
  if (record.resumeParseStatus !== "ready" || !targetRole) {
    return candidateTitle;
  }
  const workYears = formatCandidateWorkYears(record.workYears);
  if (workYears) {
    return `${targetRole}-${workYears}-${candidateTitle}`;
  }
  return `${targetRole}-${candidateTitle}`;
}

export function resumeParseStatusBadge(record: ResumePoolListRecord) {
  switch (record.resumeParseStatus) {
    case "ready": {
      return <Badge variant="success">已解析</Badge>;
    }
    case "failed": {
      return <Badge variant="destructive">解析失败</Badge>;
    }
    case "queued": {
      return <Badge variant="secondary">待解析</Badge>;
    }
    case "processing": {
      return <Badge variant="secondary">解析中</Badge>;
    }
    case "unparsed": {
      return <Badge variant="secondary">未解析</Badge>;
    }
    default: {
      return <Badge variant="secondary">{record.resumeParseStatus}</Badge>;
    }
  }
}

export function duplicateMatchBadge(record: ResumePoolListRecord, onClick?: () => void) {
  if (!record.duplicateMatch) {
    return null;
  }
  return <ResumeDuplicateMatchBadge duplicateMatch={record.duplicateMatch} onClick={onClick} />;
}

export function getResumePoolImportActionState(record: ResumePoolListRecord) {
  if (record.importedResumeRecordId) {
    return {
      disabled: false,
      label: "再次新建招聘记录",
      loading: false,
    };
  }

  switch (record.resumeParseStatus) {
    case "ready": {
      return {
        disabled: false,
        label: "新建招聘记录",
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

export function uploaderMetaLabel(record: ResumePoolListRecord) {
  const createdAt = formatDateInAppTimeZone(record.createdAt, "YY年MM月DD日:HH:mm");
  if (record.sourceChannel === "mail_ingest") {
    return `${createdAt} 扫描${uploaderUserLabel(record)}邮箱录入`;
  }
  return `${uploaderUserLabel(record)} ${createdAt} 上传`;
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

function dateKeyInAppTimeZone(value: string | Date) {
  return formatDateInAppTimeZone(value, "YYYY-MM-DD");
}

function monthLabelInAppTimeZone(value: string | Date) {
  return formatDateInAppTimeZone(value, "YYYY 年 M 月");
}

function daysBetweenDateKeys(earlier: string, later: string) {
  const earlierTimestamp = Date.parse(`${earlier}T00:00:00+08:00`);
  const laterTimestamp = Date.parse(`${later}T00:00:00+08:00`);
  return Math.round((laterTimestamp - earlierTimestamp) / 86_400_000);
}

export function groupResumePoolRecordsByCreatedAt(
  records: ResumePoolListRecord[],
  now: Date = new Date(),
): ResumePoolDateGroup[] {
  const today = dateKeyInAppTimeZone(now);
  const groups = new Map<string, ResumePoolDateGroup>();

  for (const record of records) {
    const dateKey = dateKeyInAppTimeZone(record.createdAt);
    const dayOffset = daysBetweenDateKeys(dateKey, today);
    let id = `month:${dateKey.slice(0, 7)}`;
    let label = monthLabelInAppTimeZone(record.createdAt);

    if (dayOffset === 0) {
      id = "today";
      label = "今天";
    } else if (dayOffset === 1) {
      id = "yesterday";
      label = "昨天";
    } else if (dayOffset === 2) {
      id = "day-before-yesterday";
      label = "前天";
    } else if (dateKey.startsWith(today.slice(0, 7))) {
      id = "earlier-this-month";
      label = "本月更早";
    }

    const group = groups.get(id);
    if (group) {
      group.records.push(record);
    } else {
      groups.set(id, { id, label, records: [record] });
    }
  }

  return [...groups.values()];
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
