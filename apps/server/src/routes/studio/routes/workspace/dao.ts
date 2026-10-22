import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { and, asc, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "../../../../infrastructure/db/index";
import { serializeDate } from "@app/database/serialize";
import { startOfBeijingDay } from "@app/shared/beijing-calendar";
import { FEISHU_PROVIDER_IDS, getPreferredFeishuProviderId } from "@app/feishu/provider";
import type { FeishuProviderId } from "@app/feishu/provider";
import {
  account,
  member,
  session,
  user,
  workspaceMemberDottedManager,
  workspaceMemberReporting,
} from "@app/db-schema/schema";
import { collectSelfAndReportUserIds } from "@app/resume-processing/review/support/access-recruiting-visibility";

// 给「面试官多选」用的精简 member DTO。
// Lightweight member DTO for interviewer multi-select pickers.
export interface WorkspaceMemberRow {
  createdAt: string;
  id: string;
  memberId: string;
  name: string;
  email: string;
  feishuProviderIds: FeishuProviderId[];
  image: string | null;
  role: string;
}

export async function listWorkspaceMembers(organizationId: string): Promise<WorkspaceMemberRow[]> {
  const rows = await db
    .select({
      createdAt: member.createdAt,
      email: user.email,
      id: user.id,
      image: user.image,
      memberId: member.id,
      name: user.name,
      role: member.role,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, organizationId))
    .orderBy(asc(user.name));
  if (rows.length === 0) {
    return [];
  }
  const feishuAccounts = await db
    .select({ providerId: account.providerId, userId: account.userId })
    .from(account)
    .where(
      and(
        inArray(
          account.userId,
          rows.map((row) => row.id),
        ),
        inArray(account.providerId, [...FEISHU_PROVIDER_IDS]),
      ),
    );
  const providerIdsByUser = new Map<string, Set<FeishuProviderId>>();
  for (const feishuAccount of feishuAccounts) {
    if (feishuAccount.providerId !== "feishu" && feishuAccount.providerId !== "feishu-jiguang-hr") {
      continue;
    }
    const providerIds = providerIdsByUser.get(feishuAccount.userId) ?? new Set<FeishuProviderId>();
    providerIds.add(feishuAccount.providerId);
    providerIdsByUser.set(feishuAccount.userId, providerIds);
  }
  return rows.map((row) => {
    const feishuProviderIds = FEISHU_PROVIDER_IDS.filter((providerId) =>
      providerIdsByUser.get(row.id)?.has(providerId),
    );
    return {
      createdAt: row.createdAt.toISOString(),
      email: row.email,
      feishuProviderIds:
        feishuProviderIds.length > 0 ? feishuProviderIds : [getPreferredFeishuProviderId()],
      id: row.id,
      image: row.image,
      memberId: row.memberId,
      name: row.name ?? "未命名",
      role: row.role,
    };
  });
}

export interface WorkspaceMemberDirectoryRecord {
  createdAt: string;
  email: string;
  id: string;
  image: string | null;
  lastActiveAt: string | null;
  managerUserId: string | null;
  name: string;
  role: string;
  shareWithPeers: boolean;
  /** 虚线汇报上级。Dotted-line managers. */
  dottedManagerUserIds: string[];
  userId: string;
}

const WORKSPACE_MEMBER_LAST_ACTIVE_AT = sql<
  Date | string | null
>`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`;

/** 工作区全部成员及汇报设置，供成员树一次性渲染。All members with their reporting settings. */
export async function listWorkspaceMemberDirectory(
  organizationId: string,
): Promise<WorkspaceMemberDirectoryRecord[]> {
  const rows = await db
    .select({
      createdAt: member.createdAt,
      email: user.email,
      id: member.id,
      image: user.image,
      lastActiveAt: WORKSPACE_MEMBER_LAST_ACTIVE_AT.as("last_active_at"),
      managerUserId: workspaceMemberReporting.managerUserId,
      name: user.name,
      role: member.role,
      shareWithPeers: workspaceMemberReporting.shareWithPeers,
      userId: member.userId,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .leftJoin(session, eq(session.userId, user.id))
    .leftJoin(
      workspaceMemberReporting,
      and(
        eq(workspaceMemberReporting.organizationId, member.organizationId),
        eq(workspaceMemberReporting.userId, member.userId),
      ),
    )
    .where(eq(member.organizationId, organizationId))
    .groupBy(
      member.id,
      user.id,
      workspaceMemberReporting.managerUserId,
      workspaceMemberReporting.shareWithPeers,
    )
    .orderBy(asc(member.createdAt), asc(member.id));

  const dottedEdges = await db
    .select({
      managerUserId: workspaceMemberDottedManager.managerUserId,
      userId: workspaceMemberDottedManager.userId,
    })
    .from(workspaceMemberDottedManager)
    .where(eq(workspaceMemberDottedManager.organizationId, organizationId))
    .orderBy(asc(workspaceMemberDottedManager.createdAt));
  const dottedManagersByUser = new Map<string, string[]>();
  for (const edge of dottedEdges) {
    const managers = dottedManagersByUser.get(edge.userId) ?? [];
    managers.push(edge.managerUserId);
    dottedManagersByUser.set(edge.userId, managers);
  }

  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    dottedManagerUserIds: dottedManagersByUser.get(row.userId) ?? [],
    lastActiveAt: serializeDate(row.lastActiveAt),
    name: row.name ?? row.email,
    shareWithPeers: row.shareWithPeers ?? false,
  }));
}

type ReportingGraphExecutor = Pick<typeof db, "select">;

/** 汇报线全图：直属上级与虚线汇报上级。Full reporting graph used for cycle checks. */
async function loadReportingGraph(executor: ReportingGraphExecutor, organizationId: string) {
  const [lines, dottedEdges] = await Promise.all([
    executor
      .select({
        managerUserId: workspaceMemberReporting.managerUserId,
        userId: workspaceMemberReporting.userId,
      })
      .from(workspaceMemberReporting)
      .where(eq(workspaceMemberReporting.organizationId, organizationId)),
    executor
      .select({
        managerUserId: workspaceMemberDottedManager.managerUserId,
        userId: workspaceMemberDottedManager.userId,
      })
      .from(workspaceMemberDottedManager)
      .where(eq(workspaceMemberDottedManager.organizationId, organizationId)),
  ]);
  return { dottedEdges, lines };
}

function lockWorkspaceReporting(executor: Pick<typeof db, "execute">, organizationId: string) {
  return executor.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`workspace_member_reporting:${organizationId}`}))`,
  );
}

async function isWorkspaceMember(
  executor: Pick<typeof db, "select">,
  organizationId: string,
  userId: string,
) {
  const [row] = await executor
    .select({ id: member.id })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export type SetWorkspaceMemberManagerResult =
  | "cycle"
  | "manager-not-found"
  | "member-not-found"
  | "self"
  | "updated";

/**
 * 为一个或多个成员设置或清除同一个直属上级，全部成功或全部不变。同一工作区内串行执行，
 * 避免并发设置绕过环检测；上级不能是被设置的成员本人或其任一下级。
 * Sets or clears the same direct manager for one or more members atomically. Serialized per
 * workspace so concurrent edits cannot slip a cycle past the check.
 */
export async function setWorkspaceMemberManager({
  actorUserId,
  managerUserId,
  organizationId,
  userIds,
}: {
  actorUserId: string;
  managerUserId: string | null;
  organizationId: string;
  userIds: readonly string[];
}): Promise<SetWorkspaceMemberManagerResult> {
  const targetUserIds = [...new Set(userIds)];
  if (managerUserId && targetUserIds.includes(managerUserId)) {
    return "self";
  }
  return await db.transaction(async (tx) => {
    await lockWorkspaceReporting(tx, organizationId);
    const memberRows = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(eq(member.organizationId, organizationId));
    const memberUserIds = new Set(memberRows.map((row) => row.userId));
    if (targetUserIds.length === 0 || targetUserIds.some((userId) => !memberUserIds.has(userId))) {
      return "member-not-found";
    }
    if (managerUserId) {
      if (!memberUserIds.has(managerUserId)) {
        return "manager-not-found";
      }
      const { dottedEdges, lines } = await loadReportingGraph(tx, organizationId);
      if (
        targetUserIds.some((userId) =>
          collectSelfAndReportUserIds(userId, lines, dottedEdges).includes(managerUserId),
        )
      ) {
        return "cycle";
      }
    }
    await tx
      .insert(workspaceMemberReporting)
      .values(
        targetUserIds.map((userId) => ({
          createdBy: actorUserId,
          managerUserId,
          organizationId,
          userId,
        })),
      )
      .onConflictDoUpdate({
        set: { managerUserId, updatedAt: new Date() },
        target: [workspaceMemberReporting.organizationId, workspaceMemberReporting.userId],
      });
    return "updated";
  });
}

/**
 * 整组替换成员的虚线汇报上级。上级不能是本人或其任一下级（含虚线关系），避免可见关系成环。
 * Replaces a member's dotted-line managers; none may be the member or any of their reports.
 */
export async function setWorkspaceMemberDottedManagers({
  actorUserId,
  managerUserIds,
  organizationId,
  userId,
}: {
  actorUserId: string;
  managerUserIds: readonly string[];
  organizationId: string;
  userId: string;
}): Promise<SetWorkspaceMemberManagerResult> {
  const targetManagerUserIds = [...new Set(managerUserIds)];
  if (targetManagerUserIds.includes(userId)) {
    return "self";
  }
  return await db.transaction(async (tx) => {
    await lockWorkspaceReporting(tx, organizationId);
    const memberRows = await tx
      .select({ userId: member.userId })
      .from(member)
      .where(eq(member.organizationId, organizationId));
    const memberUserIds = new Set(memberRows.map((row) => row.userId));
    if (!memberUserIds.has(userId)) {
      return "member-not-found";
    }
    if (targetManagerUserIds.some((managerUserId) => !memberUserIds.has(managerUserId))) {
      return "manager-not-found";
    }
    const { dottedEdges, lines } = await loadReportingGraph(tx, organizationId);
    const reportUserIds = new Set(collectSelfAndReportUserIds(userId, lines, dottedEdges));
    if (targetManagerUserIds.some((managerUserId) => reportUserIds.has(managerUserId))) {
      return "cycle";
    }
    await tx
      .delete(workspaceMemberDottedManager)
      .where(
        and(
          eq(workspaceMemberDottedManager.organizationId, organizationId),
          eq(workspaceMemberDottedManager.userId, userId),
        ),
      );
    if (targetManagerUserIds.length > 0) {
      await tx.insert(workspaceMemberDottedManager).values(
        targetManagerUserIds.map((managerUserId) => ({
          createdBy: actorUserId,
          managerUserId,
          organizationId,
          userId,
        })),
      );
    }
    return "updated";
  });
}

/** 设置成员是否把本人创建的招聘数据共享给同级。Toggles sharing the member's own data with peers. */
export async function setWorkspaceMemberPeerSharing({
  actorUserId,
  organizationId,
  shareWithPeers,
  userId,
}: {
  actorUserId: string;
  organizationId: string;
  shareWithPeers: boolean;
  userId: string;
}): Promise<"member-not-found" | "updated"> {
  return await db.transaction(async (tx) => {
    await lockWorkspaceReporting(tx, organizationId);
    if (!(await isWorkspaceMember(tx, organizationId, userId))) {
      return "member-not-found";
    }
    await tx
      .insert(workspaceMemberReporting)
      .values({ createdBy: actorUserId, organizationId, shareWithPeers, userId })
      .onConflictDoUpdate({
        set: { shareWithPeers, updatedAt: new Date() },
        target: [workspaceMemberReporting.organizationId, workspaceMemberReporting.userId],
      });
    return "updated";
  });
}

/**
 * 成员离开前把其直属下级挂到他的上级下（没有上级则成为顶层），保持汇报线连续；下级的共享设置不变。
 * Before a member leaves, hand their direct reports to their own manager (or make them top-level),
 * keeping each report's peer-sharing choice.
 */
export async function reassignReportsBeforeMemberRemoval({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    await lockWorkspaceReporting(tx, organizationId);
    const [ownLine] = await tx
      .select({ managerUserId: workspaceMemberReporting.managerUserId })
      .from(workspaceMemberReporting)
      .where(
        and(
          eq(workspaceMemberReporting.organizationId, organizationId),
          eq(workspaceMemberReporting.userId, userId),
        ),
      )
      .limit(1);
    await tx
      .update(workspaceMemberReporting)
      .set({ managerUserId: ownLine?.managerUserId ?? null, updatedAt: new Date() })
      .where(
        and(
          eq(workspaceMemberReporting.organizationId, organizationId),
          eq(workspaceMemberReporting.managerUserId, userId),
        ),
      );
  });
}

export interface MemberLastActiveRow {
  userId: string;
  /** ISO 字符串 / null 代表该用户从未登录过。 */
  lastActiveAt: string | null;
}

/**
 * 取工作区每个成员"最近一次活跃"时间。
 *
 * 数据源：`COALESCE(MAX(session.updated_at), user.last_active_at)`。
 *   - `MAX(session.updatedAt)`：当前还有活跃 session 时给出滚动更新的细粒度时间
 *     （受 `session.updateAge` 限制，配置成了 5 分钟）。
 *   - `user.lastActiveAt`：每次新建 session 时由 databaseHooks.session.create.after
 *     写入；session 行后续被登出/过期清理后这个值仍在，作为兜底。两者并存能
 *     避免"昨天还在用今天却显示从未登录"的回归。
 *
 * Source: `COALESCE(MAX(session.updated_at), user.last_active_at)`. The
 * session-side MAX gives sub-day granularity while there's an active session
 * (capped by `session.updateAge`, set to 5min). user.lastActiveAt is the
 * durable anchor written on every sign-in via the session.create.after hook,
 * surviving logout/expiry so the column doesn't regress to "从未登录" after a
 * previously-seen user logs out.
 */
export async function listWorkspaceMemberLastActives(
  organizationId: string,
): Promise<MemberLastActiveRow[]> {
  const memberIds = await db
    .select({ userId: member.userId })
    .from(member)
    .where(eq(member.organizationId, organizationId));

  const userIds = memberIds.map((row) => row.userId);
  if (userIds.length === 0) {
    return [];
  }

  // Auth timestamps are stored as timestamptz, so the raw aggregate can leave
  // Postgres as a real instant and the client renders it in the browser's
  // current timezone.
  const rows = await db
    .select({
      lastActiveAt: sql<
        Date | string | null
      >`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`.as("last_active_at"),
      userId: user.id,
    })
    .from(user)
    .leftJoin(session, eq(session.userId, user.id))
    .where(inArray(user.id, userIds))
    .groupBy(user.id)
    .orderBy(desc(sql`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`));

  return rows.map((row) => ({
    lastActiveAt: serializeDate(row.lastActiveAt),
    userId: row.userId,
  }));
}

/** Full-year window for the personal contribution calendar (~53 weeks). */
const MY_ACTIVITY_LOOKBACK_DAYS = 365;

export interface MyResumeActivityDay {
  count: number;
  day: string;
}

/**
 * Daily count of candidates the current user added to this workspace over the
 * last year. Empty days are omitted; the client zero-fills the calendar grid.
 */
export async function loadMyResumeActivity({
  organizationId,
  userId,
}: {
  organizationId: string;
  userId: string;
}): Promise<MyResumeActivityDay[]> {
  const since = startOfBeijingDay(
    new Date(Date.now() - (MY_ACTIVITY_LOOKBACK_DAYS - 1) * 24 * 60 * 60 * 1000),
  );

  const dayExpr = sql<string>`to_char(date_trunc('day', ${recruitingRecordReadModel.createdAt} AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD')`;

  const rows = await db
    .select({
      count: count(),
      day: dayExpr,
    })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, organizationId),
        eq(recruitingRecordReadModel.createdBy, userId),
        gte(recruitingRecordReadModel.createdAt, since),
      ),
    )
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  return rows.map((row) => ({ count: row.count, day: row.day }));
}
