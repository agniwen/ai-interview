const FILE_EXTENSION_PATTERN = /\.[a-z0-9]{1,10}$/i;
const SEGMENT_SEPARATOR_PATTERN = /[\s_\-–—+()[\]{}<>《》【】（）,，.。/\\|]+/g;
const ROLE_LEVEL_PREFIX_PATTERN = /^(?:高级|资深)\s*/u;
const ROLE_LEVEL_SUFFIX_PATTERN =
  /\s*(?:高级经理|资深经理|经理|总监|专家|负责人|主管|专员|实习生)$/u;
const EXPLICIT_ROLE_LEVEL_PATTERN =
  /^(?:高级|资深)|(?:高级经理|资深经理|经理|总监|专家|负责人|主管|专员|实习生)$/u;

export interface FilenameJobCandidate {
  id: string;
  name: string;
}

export type FilenameJobMatchResult =
  | { jobDescriptionId: string; status: "exact" }
  | { jobDescriptionIds: string[]; status: "ambiguous" }
  | { status: "unmatched" };

export interface TargetRoleJobMatches {
  coreIds: string[];
  exactIds: string[];
}

function normalizeSegmentText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replaceAll(SEGMENT_SEPARATOR_PATTERN, " ")
    .trim()
    .replaceAll(/\s+/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsCompleteSegment(fileName: string, jobName: string): boolean {
  const pattern = new RegExp(`(?:^| )${escapeRegExp(jobName)}(?: |$)`, "u");
  return pattern.test(fileName);
}

function normalizeRoleCore(value: string): string {
  return normalizeSegmentText(value)
    .replace(ROLE_LEVEL_PREFIX_PATTERN, "")
    .replace(ROLE_LEVEL_SUFFIX_PATTERN, "")
    .trim();
}

function deduplicateIds(ids: string[]): string[] {
  return [...new Set(ids)];
}

export function matchPublishedJobFromResumeFileName(
  resumeFileName: string | null | undefined,
  candidates: readonly FilenameJobCandidate[],
): FilenameJobMatchResult {
  if (!resumeFileName || candidates.length === 0) {
    return { status: "unmatched" };
  }

  const normalizedFileName = normalizeSegmentText(
    resumeFileName.trim().replace(FILE_EXTENSION_PATTERN, ""),
  );
  if (!normalizedFileName) {
    return { status: "unmatched" };
  }

  const matchedIds = candidates.flatMap((candidate) => {
    const normalizedName = normalizeSegmentText(candidate.name);
    return normalizedName && containsCompleteSegment(normalizedFileName, normalizedName)
      ? [candidate.id]
      : [];
  });
  const uniqueIds = [...new Set(matchedIds)];
  const [jobDescriptionId] = uniqueIds;
  if (uniqueIds.length === 1 && jobDescriptionId) {
    return { jobDescriptionId, status: "exact" };
  }
  if (uniqueIds.length > 1) {
    return { jobDescriptionIds: uniqueIds, status: "ambiguous" };
  }
  return { status: "unmatched" };
}

export function matchPublishedJobsFromResumeFileNameCore(
  resumeFileName: string | null | undefined,
  candidates: readonly FilenameJobCandidate[],
): string[] {
  if (!resumeFileName || candidates.length === 0) {
    return [];
  }
  const normalizedFileName = normalizeSegmentText(
    resumeFileName.trim().replace(FILE_EXTENSION_PATTERN, ""),
  );
  if (!normalizedFileName) {
    return [];
  }
  return deduplicateIds(
    candidates.flatMap((candidate) => {
      const roleCore = normalizeRoleCore(candidate.name);
      return roleCore && containsCompleteSegment(normalizedFileName, roleCore)
        ? [candidate.id]
        : [];
    }),
  );
}

export function matchPublishedJobsFromTargetRoles(
  targetRoles: readonly string[],
  candidates: readonly FilenameJobCandidate[],
): TargetRoleJobMatches {
  if (targetRoles.length === 0 || candidates.length === 0) {
    return { coreIds: [], exactIds: [] };
  }
  const normalizedCandidates = candidates.map((candidate) => ({
    ...candidate,
    normalizedName: normalizeSegmentText(candidate.name),
    roleCore: normalizeRoleCore(candidate.name),
  }));
  const exactIds: string[] = [];
  const coreIds: string[] = [];

  for (const targetRole of targetRoles) {
    const normalizedTargetRole = normalizeSegmentText(targetRole);
    if (!normalizedTargetRole) {
      continue;
    }
    const exactMatches = normalizedCandidates.filter(
      (candidate) => candidate.normalizedName === normalizedTargetRole,
    );
    exactIds.push(...exactMatches.map((candidate) => candidate.id));

    if (EXPLICIT_ROLE_LEVEL_PATTERN.test(normalizedTargetRole)) {
      continue;
    }
    const targetRoleCore = normalizeRoleCore(normalizedTargetRole);
    coreIds.push(
      ...normalizedCandidates.flatMap((candidate) =>
        candidate.normalizedName !== normalizedTargetRole &&
        candidate.roleCore &&
        candidate.roleCore === targetRoleCore
          ? [candidate.id]
          : [],
      ),
    );
  }

  const uniqueExactIds = deduplicateIds(exactIds);
  const exactIdSet = new Set(uniqueExactIds);
  return {
    coreIds: deduplicateIds(coreIds).filter((id) => !exactIdSet.has(id)),
    exactIds: uniqueExactIds,
  };
}
