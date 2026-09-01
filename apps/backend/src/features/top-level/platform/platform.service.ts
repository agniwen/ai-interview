import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import { member, organization, session, user } from "@arc/db-schema/schema";
import { listTextFiltersSchema, parseListTextFilters } from "@arc/shared/list-text-filters";
import type { ListTextResource, listTextFields } from "@arc/shared/list-text-filters";
import { TOP_LEVEL_DATABASE_PORT } from "../top-level.ports.js";
import type { TopLevelDatabasePort } from "../top-level.ports.js";
import { TOP_LEVEL_PLATFORM_OPERATIONS_PORT } from "./platform.port.js";
import type { TopLevelPlatformOperationsPort, TopLevelPlatformPort } from "./platform.port.js";
import type {
  platformCreateMailAccountSchema,
  platformLiveKitMetricsQuerySchema,
  platformLiveKitRoomsQuerySchema,
  platformMailAccountsQuerySchema,
  platformNotificationsQuerySchema,
  platformOrganizationMembersQuerySchema,
  platformOrganizationQuerySchema,
  platformQueueJobsQuerySchema,
  platformResumeParseCacheQuerySchema,
  platformUpdateMailAccountSchema,
  platformUserRemarkSchema,
  platformUsersQuerySchema,
} from "./platform.schemas.js";
import type { z } from "zod";

function literalTextContains(column: SQLWrapper, value: string) {
  return sql`${column} ILIKE ${`%${value.replaceAll(/[!%_]/gu, "!$&")}%`} ESCAPE '!'`;
}

function listTextFilterWhere<R extends ListTextResource>(
  resource: R,
  value: string | null | undefined,
  columns: Record<keyof (typeof listTextFields)[R], SQLWrapper>,
) {
  const parsed = listTextFiltersSchema(resource).parse(value ?? undefined);
  const fields: Record<string, SQLWrapper> = columns;
  return and(
    ...Object.entries(parseListTextFilters(parsed))
      .filter(([, text]) => text)
      .map(([key, text]) => literalTextContains(fields[key], text)),
  );
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

@Injectable()
export class PlatformService implements TopLevelPlatformPort {
  constructor(
    @Inject(TOP_LEVEL_DATABASE_PORT)
    private readonly database: TopLevelDatabasePort,
    @Inject(TOP_LEVEL_PLATFORM_OPERATIONS_PORT)
    private readonly operations: TopLevelPlatformOperationsPort,
  ) {}

  async listOrganizations(query: z.infer<typeof platformOrganizationQuerySchema>) {
    const offset = (query.page - 1) * query.pageSize;
    const where = and(
      listTextFilterWhere("organizations", query.textFilters, {
        name: organization.name,
        slug: organization.slug,
      }),
      query.search?.trim()
        ? or(
            ilike(organization.name, `%${query.search.trim()}%`),
            ilike(organization.slug, `%${query.search.trim()}%`),
          )
        : undefined,
    );
    const memberCounts = this.database
      .select({ count: count(member.id).as("cnt"), organizationId: member.organizationId })
      .from(member)
      .groupBy(member.organizationId)
      .as("mc");
    const sortColumns = {
      createdAt: organization.createdAt,
      memberCount: sql`coalesce("mc"."cnt", 0)`,
      name: organization.name,
      slug: organization.slug,
    };
    const sortColumn = sortColumns[query.sortBy];
    const direction = query.sortOrder === "asc" ? asc : desc;
    const [records, totals] = await Promise.all([
      this.database
        .select({
          createdAt: organization.createdAt,
          id: organization.id,
          memberCount: sql<number>`coalesce("mc"."cnt", 0)`.as("member_count"),
          name: organization.name,
          slug: organization.slug,
        })
        .from(organization)
        .leftJoin(memberCounts, eq(memberCounts.organizationId, organization.id))
        .where(where)
        .orderBy(direction(sortColumn))
        .limit(query.pageSize)
        .offset(offset),
      this.database.select({ total: count() }).from(organization).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: records.map((record) => ({
        ...record,
        createdAt: record.createdAt.toISOString(),
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async getOrganization(
    organizationId: string,
    query: z.infer<typeof platformOrganizationMembersQuerySchema>,
  ) {
    const [workspace] = await this.database
      .select({
        createdAt: organization.createdAt,
        id: organization.id,
        metadata: organization.metadata,
        name: organization.name,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1);
    if (!workspace) {
      throw new NotFoundException("Workspace not found", {
        errorCode: "PLATFORM_WORKSPACE_NOT_FOUND",
      });
    }
    const [records, totals] = await Promise.all([
      this.database
        .select({
          createdAt: member.createdAt,
          id: member.id,
          role: member.role,
          userEmail: user.email,
          userId: member.userId,
          userImage: user.image,
          userName: user.name,
        })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(eq(member.organizationId, organizationId))
        .orderBy(desc(member.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ total: count() })
        .from(member)
        .where(eq(member.organizationId, organizationId)),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      members: {
        page: query.page,
        pageSize: query.pageSize,
        records: records.map((record) => ({
          ...record,
          createdAt: record.createdAt.toISOString(),
        })),
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      organization: { ...workspace, createdAt: workspace.createdAt.toISOString() },
    };
  }

  async listUsers(query: z.infer<typeof platformUsersQuerySchema>) {
    const where = and(
      listTextFilterWhere("users", query.textFilters, {
        email: user.email,
        name: user.name,
      }),
      query.search?.trim()
        ? or(
            ilike(user.name, `%${query.search.trim()}%`),
            ilike(user.email, `%${query.search.trim()}%`),
          )
        : undefined,
    );
    const lastActive = sql<
      Date | string | null
    >`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt}))`;
    const simpleSortColumns = {
      createdAt: user.createdAt,
      email: user.email,
      name: user.name,
      role: user.role,
    };
    let simpleSortColumn: SQLWrapper = user.createdAt;
    if (query.sortBy !== "lastActiveAt") {
      simpleSortColumn = simpleSortColumns[query.sortBy];
    }
    const direction = query.sortOrder === "asc" ? asc : desc;
    let order = direction(simpleSortColumn);
    if (query.sortBy === "lastActiveAt") {
      order =
        query.sortOrder === "asc"
          ? sql`${lastActive} asc nulls last`
          : sql`${lastActive} desc nulls last`;
    }
    const [records, totals] = await Promise.all([
      this.database
        .select({
          banExpires: user.banExpires,
          banReason: user.banReason,
          banned: user.banned,
          createdAt: user.createdAt,
          email: user.email,
          emailVerified: user.emailVerified,
          feishuTenantName: user.feishuTenantName,
          id: user.id,
          image: user.image,
          lastActiveAt: lastActive.as("last_active_at"),
          name: user.name,
          remark: user.remark,
          role: user.role,
          updatedAt: user.updatedAt,
        })
        .from(user)
        .leftJoin(session, eq(session.userId, user.id))
        .where(where)
        .groupBy(user.id)
        .orderBy(order, desc(user.createdAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database.select({ total: count() }).from(user).where(where),
    ]);
    const total = totals[0]?.total ?? 0;
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: records.map((record) => ({
        ...record,
        banExpires: record.banExpires?.toISOString() ?? null,
        createdAt: record.createdAt.toISOString(),
        lastActiveAt: toIsoString(record.lastActiveAt),
        updatedAt: record.updatedAt.toISOString(),
      })),
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async updateUserRemark(userId: string, input: z.infer<typeof platformUserRemarkSchema>) {
    const [updated] = await this.database
      .update(user)
      .set({ remark: input.remark?.trim() || null, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id, remark: user.remark, updatedAt: user.updatedAt });
    if (!updated) {
      throw new NotFoundException("User not found", {
        errorCode: "PLATFORM_USER_NOT_FOUND",
      });
    }
    return { ...updated, updatedAt: updated.updatedAt.toISOString() };
  }

  async getUserWorkspaces(userId: string) {
    const [targetUser] = await this.database
      .select({ email: user.email, id: user.id, image: user.image, name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    if (!targetUser) {
      throw new NotFoundException("User not found", {
        errorCode: "PLATFORM_USER_NOT_FOUND",
      });
    }
    const records = await this.database
      .select({
        createdAt: member.createdAt,
        id: member.id,
        organizationCreatedAt: organization.createdAt,
        organizationId: organization.id,
        organizationName: organization.name,
        organizationSlug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, userId))
      .orderBy(desc(member.createdAt));
    return {
      records: records.map((record) => ({
        ...record,
        createdAt: record.createdAt.toISOString(),
        organizationCreatedAt: record.organizationCreatedAt.toISOString(),
      })),
      total: records.length,
      user: targetUser,
    };
  }

  createMailAccount(input: z.infer<typeof platformCreateMailAccountSchema>) {
    return this.operations.createMailAccount(input);
  }
  deleteResumeParseCache(hash: string) {
    return this.operations.deleteResumeParseCache(hash);
  }
  getLiveKitMetrics(input: z.infer<typeof platformLiveKitMetricsQuerySchema>) {
    return this.operations.getLiveKitMetrics(input);
  }
  getLiveKitOverview() {
    return this.operations.getLiveKitOverview();
  }
  getLiveKitRoom(roomName: string) {
    return this.operations.getLiveKitRoom(roomName);
  }
  getNotificationPreview(id: string) {
    return this.operations.getNotificationPreview(id);
  }
  getQueueJobs(queueName: string, query: z.infer<typeof platformQueueJobsQuerySchema>) {
    return this.operations.getQueueJobs(queueName, query);
  }
  getResumeParseCache(hash: string) {
    return this.operations.getResumeParseCache(hash);
  }
  grantNotificationDocumentAccess(input: { id: string; userId: string }) {
    return this.operations.grantNotificationDocumentAccess(input);
  }
  listLiveKitRooms(input: z.infer<typeof platformLiveKitRoomsQuerySchema>) {
    return this.operations.listLiveKitRooms(input);
  }
  listMailAccounts(input: z.infer<typeof platformMailAccountsQuerySchema>) {
    return this.operations.listMailAccounts(input);
  }
  listNotifications(input: z.infer<typeof platformNotificationsQuerySchema>) {
    return this.operations.listNotifications(input);
  }
  listQueues() {
    return this.operations.listQueues();
  }
  listResumeParseCache(input: z.infer<typeof platformResumeParseCacheQuerySchema>) {
    return this.operations.listResumeParseCache(input);
  }
  resendNotification(id: string) {
    return this.operations.resendNotification(id);
  }
  updateMailAccount(id: string, input: z.infer<typeof platformUpdateMailAccountSchema>) {
    return this.operations.updateMailAccount(id, input);
  }
  updateNotificationDocumentStructure(id: string) {
    return this.operations.updateNotificationDocumentStructure(id);
  }
}
