import { and, eq } from "drizzle-orm";
import { db } from "../runtime/db";
import {
  member,
  workspaceMemberDottedManager,
  workspaceMemberReporting,
} from "@app/db-schema/schema";
import { NO_ACCESS_WORKSPACE_ROLE } from "@app/shared/permissions";

/**
 * 招聘数据可见范围（ADR-0043）：owner/admin 看全部；其他成员看自己和全部直接、间接下级（含虚线汇报上级关系）
 * 创建的数据，以及勾选了“共享给同级”的同级成员本人创建的数据。
 * Recruiting visibility: owner/admin see all; other members see their own records, those of every
 * direct or indirect report, and those of peers who opted in to share with peers.
 */
export type RecruitingVisibilityScope =
  | { kind: "all" }
  | { kind: "restricted"; userIds: string[] }
  | { kind: "none" };

const ALL_DATA_ROLES = new Set(["owner", "admin"]);

export interface WorkspaceReportingLine {
  managerUserId: string | null;
  shareWithPeers?: boolean;
  userId: string;
}

/** 虚线汇报上级关系。Dotted-line manager edge. */
export interface WorkspaceDottedManagerEdge {
  managerUserId: string;
  userId: string;
}

/**
 * 自己 + 全部下级（广度优先，遇环停止）。直属上级与虚线汇报上级两种关系都算下级。
 * Self plus every transitive report through direct and dotted-line edges; cycle-safe.
 */
export function collectSelfAndReportUserIds(
  userId: string,
  lines: readonly WorkspaceReportingLine[],
  dottedEdges: readonly WorkspaceDottedManagerEdge[] = [],
): string[] {
  const reportsByManager = new Map<string, string[]>();
  for (const line of [...lines, ...dottedEdges]) {
    if (!line.managerUserId) {
      continue;
    }
    const reports = reportsByManager.get(line.managerUserId) ?? [];
    reports.push(line.userId);
    reportsByManager.set(line.managerUserId, reports);
  }
  const visible = new Set([userId]);
  const queue = [userId];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    for (const report of reportsByManager.get(next) ?? []) {
      if (!visible.has(report)) {
        visible.add(report);
        queue.push(report);
      }
    }
  }
  return [...visible];
}

/**
 * 非管理员可见的创建人：自己、全部下级，以及开启共享的同级（同一直属上级；都没有上级的顶层成员互为同级）。
 * 同级共享只开放该同级本人创建的数据，不连带其下级。没有汇报设置的成员视为顶层且未共享。
 * Creators visible to a non-admin member: self, transitive reports, and opted-in peers (same direct
 * manager; top-level members are peers of each other). Peer sharing covers only the peer's own data.
 */
export function collectVisibleCreatorUserIds(
  userId: string,
  lines: readonly WorkspaceReportingLine[],
  dottedEdges: readonly WorkspaceDottedManagerEdge[] = [],
): string[] {
  const visible = new Set(collectSelfAndReportUserIds(userId, lines, dottedEdges));
  const ownManagerUserId = lines.find((line) => line.userId === userId)?.managerUserId ?? null;
  for (const line of lines) {
    if (line.shareWithPeers && line.userId !== userId && line.managerUserId === ownManagerUserId) {
      visible.add(line.userId);
    }
  }
  return [...visible];
}

export async function resolveRecruitingVisibilityScope({
  currentRole,
  organizationId,
  userId,
}: {
  currentRole?: string | null;
  organizationId: string;
  userId: string;
}): Promise<RecruitingVisibilityScope> {
  if (currentRole && ALL_DATA_ROLES.has(currentRole)) {
    return { kind: "all" };
  }

  const [currentMember] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);

  if (!currentMember || currentMember.role === NO_ACCESS_WORKSPACE_ROLE) {
    return { kind: "none" };
  }
  if (ALL_DATA_ROLES.has(currentMember.role)) {
    return { kind: "all" };
  }

  const [lines, dottedEdges] = await Promise.all([
    db
      .select({
        managerUserId: workspaceMemberReporting.managerUserId,
        shareWithPeers: workspaceMemberReporting.shareWithPeers,
        userId: workspaceMemberReporting.userId,
      })
      .from(workspaceMemberReporting)
      .where(eq(workspaceMemberReporting.organizationId, organizationId)),
    db
      .select({
        managerUserId: workspaceMemberDottedManager.managerUserId,
        userId: workspaceMemberDottedManager.userId,
      })
      .from(workspaceMemberDottedManager)
      .where(eq(workspaceMemberDottedManager.organizationId, organizationId)),
  ]);
  return {
    kind: "restricted",
    userIds: collectVisibleCreatorUserIds(userId, lines, dottedEdges),
  };
}

export function intersectRequestedCreatorIds(
  requestedCreatorIds: string[] | null | undefined,
  scope: RecruitingVisibilityScope,
): string[] | null {
  const requested = requestedCreatorIds?.filter((id) => id.trim().length > 0);

  if (scope.kind === "all") {
    return requested && requested.length > 0 ? requested : null;
  }

  if (scope.kind === "none") {
    return [];
  }

  if (!requested || requested.length === 0) {
    return scope.userIds;
  }

  const visible = new Set(scope.userIds);
  return requested.filter((id) => visible.has(id));
}
