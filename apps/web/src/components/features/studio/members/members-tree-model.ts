/** 工作区成员汇报线树：每人最多一个直属上级，上级不在当前列表中的成员作为顶层。 */

export interface MemberTreeRecord {
  /** 额外可见上级：不参与树结构，只用于防止可见关系成环。Dotted-line managers. */
  dottedManagerUserIds?: readonly string[];
  email: string;
  managerUserId: string | null;
  name: string;
  userId: string;
}

export interface MemberTreeRow<T extends MemberTreeRecord> {
  depth: number;
  /** 直属下级人数。Number of direct reports. */
  directReportCount: number;
  /** 展开后可见下级（搜索时被迫展开的祖先也算展开）。 */
  isExpanded: boolean;
  record: T;
}

function indexReports<T extends MemberTreeRecord>(records: readonly T[]) {
  const userIds = new Set(records.map((record) => record.userId));
  const reportsByManager = new Map<string, T[]>();
  const roots: T[] = [];
  for (const record of records) {
    const { managerUserId } = record;
    if (!managerUserId || managerUserId === record.userId || !userIds.has(managerUserId)) {
      roots.push(record);
      continue;
    }
    const reports = reportsByManager.get(managerUserId) ?? [];
    reports.push(record);
    reportsByManager.set(managerUserId, reports);
  }
  return { reportsByManager, roots };
}

function matchesQuery(record: MemberTreeRecord, normalizedQuery: string) {
  return (
    record.name.toLocaleLowerCase().includes(normalizedQuery) ||
    record.email.toLocaleLowerCase().includes(normalizedQuery)
  );
}

/**
 * 按展开状态把树压平成可虚拟滚动的行。搜索时只保留命中成员及其上级链，并自动展开这些上级；
 * 命中成员自身的下级仍按用户的展开状态显示。
 * Flattens the tree for virtual scrolling. With a query, only matches and their manager chain
 * stay visible and that chain is expanded; a match's own reports follow the user's expansion.
 */
export function flattenMemberTree<T extends MemberTreeRecord>({
  expandedUserIds,
  query = "",
  records,
}: {
  expandedUserIds: ReadonlySet<string>;
  query?: string;
  records: readonly T[];
}): MemberTreeRow<T>[] {
  const { reportsByManager, roots } = indexReports(records);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const subtreeMatchCache = new Map<string, boolean>();

  const subtreeMatches = (record: T, trail: Set<string>): boolean => {
    const cached = subtreeMatchCache.get(record.userId);
    if (cached !== undefined) {
      return cached;
    }
    if (trail.has(record.userId)) {
      return false;
    }
    trail.add(record.userId);
    const matched =
      matchesQuery(record, normalizedQuery) ||
      (reportsByManager.get(record.userId) ?? []).some((report) => subtreeMatches(report, trail));
    trail.delete(record.userId);
    subtreeMatchCache.set(record.userId, matched);
    return matched;
  };

  const rows: MemberTreeRow<T>[] = [];
  const visited = new Set<string>();
  const visit = (record: T, depth: number) => {
    if (visited.has(record.userId)) {
      return;
    }
    visited.add(record.userId);
    const reports = reportsByManager.get(record.userId) ?? [];
    const userExpanded = expandedUserIds.has(record.userId);
    const matchingReports = normalizedQuery
      ? reports.filter((report) => subtreeMatches(report, new Set()))
      : [];
    const isExpanded = reports.length > 0 && (userExpanded || matchingReports.length > 0);
    rows.push({ depth, directReportCount: reports.length, isExpanded, record });
    if (!isExpanded) {
      return;
    }
    const visibleReports =
      normalizedQuery && !userExpanded && !matchesQuery(record, normalizedQuery)
        ? matchingReports
        : reports;
    for (const report of visibleReports) {
      visit(report, depth + 1);
    }
  };

  for (const root of roots) {
    if (!normalizedQuery || subtreeMatches(root, new Set())) {
      visit(root, 0);
    }
  }
  return rows;
}

/** 有下级的成员，用于“全部展开”。Members with at least one report, for expand-all. */
export function listMembersWithReports(records: readonly MemberTreeRecord[]): string[] {
  const { reportsByManager } = indexReports(records);
  return [...reportsByManager.keys()];
}

/**
 * 可设为这些成员上级（直属或额外可见）的人：排除这些成员本人和他们经直属、虚线关系可达的全部下级，避免成环。
 * Valid managers for the given members: everyone except them and their transitive reports through
 * direct and dotted-line edges.
 */
export function listManagerCandidates<T extends MemberTreeRecord>(
  records: readonly T[],
  userIds: readonly string[],
): T[] {
  const { reportsByManager } = indexReports(records);
  for (const record of records) {
    for (const managerUserId of record.dottedManagerUserIds ?? []) {
      const reports = reportsByManager.get(managerUserId) ?? [];
      reports.push(record);
      reportsByManager.set(managerUserId, reports);
    }
  }
  const excluded = new Set(userIds);
  const queue = [...userIds];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const report of reportsByManager.get(next) ?? []) {
      if (!excluded.has(report.userId)) {
        excluded.add(report.userId);
        queue.push(report.userId);
      }
    }
  }
  return records.filter((record) => !excluded.has(record.userId));
}
