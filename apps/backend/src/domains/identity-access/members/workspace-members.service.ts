import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import { Inject, Injectable } from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import { parseListTextFilters } from "@arc/shared/list-text-filters";
import { account, member, session, user } from "@arc/db-schema/schema";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import type { z } from "zod";
import type { workspaceMemberListQuerySchema } from "./workspace-members.schemas.js";

type MemberListQuery = z.infer<typeof workspaceMemberListQuerySchema>;
const FEISHU_PROVIDERS = ["feishu", "feishu-jiguang-hr"] as const;

@Injectable()
export class WorkspaceMembersService {
  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  async options(organizationId: string) {
    const rows = await this.database
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
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId))
      .orderBy(asc(user.name));
    const accounts = rows.length
      ? await this.database
          .select({ providerId: account.providerId, userId: account.userId })
          .from(account)
          .where(
            and(
              inArray(
                account.userId,
                rows.map((row) => row.id),
              ),
              inArray(account.providerId, [...FEISHU_PROVIDERS]),
            ),
          )
      : [];
    const providers = new Map<string, Set<(typeof FEISHU_PROVIDERS)[number]>>();
    for (const row of accounts) {
      if (row.providerId !== "feishu" && row.providerId !== "feishu-jiguang-hr") {
        continue;
      }
      const values = providers.get(row.userId) ?? new Set();
      values.add(row.providerId);
      providers.set(row.userId, values);
    }
    return {
      feishuHumanInterviewEnabled: rawBackendEnvironment.FEISHU_HUMAN_INTERVIEW_ENABLED === "true",
      records: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        feishuProviderIds: FEISHU_PROVIDERS.filter((id) => providers.get(row.id)?.has(id)),
        name: row.name ?? "未命名",
      })),
    };
  }

  async list(organizationId: string, query: MemberListQuery) {
    const text = parseListTextFilters(query.textFilters);
    const where = and(
      eq(member.organizationId, organizationId),
      text.name ? ilike(user.name, `%${text.name}%`) : undefined,
      text.email ? ilike(user.email, `%${text.email}%`) : undefined,
    );
    const lastActive = sql<
      Date | string | null
    >`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`;
    const orderColumn = query.sortBy === "lastActiveAt" ? lastActive : member.createdAt;
    const order = query.sortOrder === "asc" ? asc(orderColumn) : desc(orderColumn);
    const [rows, totals] = await Promise.all([
      this.database
        .select({
          createdAt: member.createdAt,
          email: user.email,
          id: member.id,
          image: user.image,
          lastActiveAt: lastActive,
          name: user.name,
          role: member.role,
          userId: member.userId,
        })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .leftJoin(session, eq(session.userId, user.id))
        .where(where)
        .groupBy(member.id, user.id)
        .orderBy(order, desc(member.id))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ total: count() })
        .from(member)
        .innerJoin(user, eq(user.id, member.userId))
        .where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastActiveAt: row.lastActiveAt ? new Date(row.lastActiveAt).toISOString() : null,
        name: row.name ?? row.email,
      })),
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }
}
