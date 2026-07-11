"use client";

import { useQuery } from "@tanstack/react-query";
import type { ResumePoolScope } from "@arc/db-schema/schema";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import type {
  ResumePoolImportDuplicateMatchRecord,
  ResumePoolImportDuplicateResult,
  ResumePoolListRecord,
} from "@arc/shared/resume-pool";

import { formatResumeCandidateTitle } from "@/components/features/resume/resume-record-display-id";
import { Badge } from "@/components/ui/badge";
import type { DedupMatchRecord } from "@/lib/client/api";
import { rpc } from "@/lib/client/rpc";

type ResumePoolSourceFilter = "all" | "non_referral" | "referral";

export type ResumePoolFilters = Record<"importStatus" | "parseStatus", string> & {
  sourceType: ResumePoolSourceFilter;
};

export function normalizeScope(value: unknown): ResumePoolScope {
  return value === "private" ? "private" : "public";
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
  const label =
    record.duplicateMatch.count > 1 ? `疑似重复 ${record.duplicateMatch.count} 条` : "疑似重复";
  const variant = record.duplicateMatch.highestLevel === "high" ? "destructive" : "secondary";
  return onClick ? (
    <Badge
      className="cursor-pointer"
      render={
        <button
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }}
          type="button"
        >
          {label}
        </button>
      }
      variant={variant}
    />
  ) : (
    <Badge variant={variant}>{label}</Badge>
  );
}

export function getResumePoolImportActionState(record: ResumePoolListRecord) {
  if (record.importedResumeRecordId) {
    return {
      disabled: true,
      label: "已入库",
      loading: false,
    };
  }

  switch (record.resumeParseStatus) {
    case "ready": {
      return {
        disabled: false,
        label: "入库到招聘台",
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

export function uploaderOrganizationLabel(record: ResumePoolListRecord) {
  return record.uploaderOrganizationName?.trim() || "未知组织";
}

export function uploaderUserLabel(record: ResumePoolListRecord) {
  return record.uploaderName?.trim() || record.uploaderEmail?.trim() || "未知上传人";
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

export function filterPoolRecords(
  records: ResumePoolListRecord[],
  input: {
    filters: ResumePoolFilters;
    search: string;
    sortBy: string | undefined;
    sortOrder: "asc" | "desc" | undefined;
  },
) {
  const filtered = records.filter((record) => {
    if (!matchesSearch(record, input.search)) {
      return false;
    }
    if (input.filters.parseStatus && record.resumeParseStatus !== input.filters.parseStatus) {
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
      const response = await rpc.api.w[":slug"].studio["job-descriptions"].all.$get({
        param: { slug },
      });
      if (!response.ok) {
        throw new Error("加载在招岗位列表失败");
      }
      const payload = (await response.json()) as { records: JobDescriptionListRecord[] };
      return payload.records;
    },
    queryKey: ["job-descriptions", "all", slug],
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
    score: match.score,
    semanticReasons: match.semanticReasons,
    similarity: match.similarity,
    status: match.status,
    targetRole: match.targetRole,
  }));
}
