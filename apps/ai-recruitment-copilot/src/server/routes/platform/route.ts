import { z } from "zod";
import { eq, sql, count, ilike, or, desc, asc } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@/server/factory";
import { adminMiddleware } from "@/server/middlewares/admin";
import { db } from "@/lib/server/db";
import { organization, member, session, user } from "@arc/db-schema/schema";

// --- Organizations list ---
const orgQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(["name", "slug", "createdAt", "memberCount"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

function orgOrderExpr(sortBy: string) {
  if (sortBy === "name") {
    return organization.name;
  }
  if (sortBy === "slug") {
    return organization.slug;
  }
  if (sortBy === "memberCount") {
    return sql`coalesce("mc"."cnt", 0)`;
  }
  return organization.createdAt;
}

const platformOrganizations = factory
  .createApp()
  .get(
    "/organizations",
    zValidator("query", orgQuerySchema, jsonValidatorError("参数校验失败")),
    async (c) => {
      const { page, pageSize, search, sortBy, sortOrder } = c.req.valid("query");
      const offset = (page - 1) * pageSize;

      const searchFilter = search?.trim()
        ? or(
            ilike(organization.name, `%${search.trim()}%`),
            ilike(organization.slug, `%${search.trim()}%`),
          )
        : undefined;

      const memberCountSubquery = db
        .select({ count: count(member.id).as("cnt"), organizationId: member.organizationId })
        .from(member)
        .groupBy(member.organizationId)
        .as("mc");

      const orderDir = sortOrder === "asc" ? asc : desc;

      const [rows, [{ total }]] = await Promise.all([
        db
          .select({
            createdAt: organization.createdAt,
            id: organization.id,
            memberCount: sql<number>`coalesce("mc"."cnt", 0)`.as("member_count"),
            name: organization.name,
            slug: organization.slug,
          })
          .from(organization)
          .leftJoin(memberCountSubquery, eq(memberCountSubquery.organizationId, organization.id))
          .where(searchFilter)
          .orderBy(orderDir(orgOrderExpr(sortBy)))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(organization).where(searchFilter),
      ]);

      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return c.json(
        {
          page,
          pageSize,
          records: rows.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          })),
          total,
          totalPages,
        },
        200,
      );
    },
  );

// --- Organization detail (members) ---
const orgMembersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
});

const organizationDetail = factory
  .createApp()
  .get(
    "/organizations/:orgId",
    zValidator("query", orgMembersQuerySchema, jsonValidatorError("参数校验失败")),
    async (c) => {
      const orgId = c.req.param("orgId");
      const { page, pageSize } = c.req.valid("query");
      const offset = (page - 1) * pageSize;

      const [org] = await db
        .select({
          createdAt: organization.createdAt,
          id: organization.id,
          metadata: organization.metadata,
          name: organization.name,
          slug: organization.slug,
        })
        .from(organization)
        .where(eq(organization.id, orgId))
        .limit(1);

      if (!org) {
        return c.json({ error: "工作区不存在" }, 404);
      }

      const [members, [{ total }]] = await Promise.all([
        db
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
          .where(eq(member.organizationId, orgId))
          .orderBy(desc(member.createdAt))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(member).where(eq(member.organizationId, orgId)),
      ]);

      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return c.json(
        {
          members: {
            page,
            pageSize,
            records: members.map((m) => ({
              ...m,
              createdAt: m.createdAt.toISOString(),
            })),
            total,
            totalPages,
          },
          organization: {
            ...org,
            createdAt: org.createdAt.toISOString(),
          },
        },
        200,
      );
    },
  );

// --- Users list ---
const userQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(["name", "email", "role", "createdAt"]).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

function userOrderExpr(sortBy: string) {
  if (sortBy === "name") {
    return user.name;
  }
  if (sortBy === "email") {
    return user.email;
  }
  if (sortBy === "role") {
    return user.role;
  }
  return user.createdAt;
}

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const platformUsers = factory
  .createApp()
  .get(
    "/users",
    zValidator("query", userQuerySchema, jsonValidatorError("参数校验失败")),
    async (c) => {
      const { page, pageSize, search, sortBy, sortOrder } = c.req.valid("query");
      const offset = (page - 1) * pageSize;

      const searchFilter = search?.trim()
        ? or(ilike(user.name, `%${search.trim()}%`), ilike(user.email, `%${search.trim()}%`))
        : undefined;

      const orderDir = sortOrder === "asc" ? asc : desc;

      const [rows, [{ total }]] = await Promise.all([
        db
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
            lastActiveAt: sql<
              Date | string | null
            >`GREATEST(MAX(${session.updatedAt}), MAX(${user.lastActiveAt})) AT TIME ZONE 'UTC'`.as(
              "last_active_at",
            ),
            name: user.name,
            role: user.role,
            updatedAt: user.updatedAt,
          })
          .from(user)
          .leftJoin(session, eq(session.userId, user.id))
          .where(searchFilter)
          .groupBy(user.id)
          .orderBy(orderDir(userOrderExpr(sortBy)))
          .limit(pageSize)
          .offset(offset),
        db.select({ total: count() }).from(user).where(searchFilter),
      ]);

      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return c.json(
        {
          page,
          pageSize,
          records: rows.map((r) => ({
            ...r,
            banExpires: r.banExpires?.toISOString() ?? null,
            createdAt: r.createdAt.toISOString(),
            lastActiveAt: toIsoString(r.lastActiveAt),
            updatedAt: r.updatedAt.toISOString(),
          })),
          total,
          totalPages,
        },
        200,
      );
    },
  )
  .get("/users/:userId/workspaces", async (c) => {
    const userId = c.req.param("userId");

    const [targetUser] = await db
      .select({
        email: user.email,
        id: user.id,
        image: user.image,
        name: user.name,
      })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);

    if (!targetUser) {
      return c.json({ error: "用户不存在" }, 404);
    }

    const memberships = await db
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

    return c.json(
      {
        records: memberships.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
          organizationCreatedAt: row.organizationCreatedAt.toISOString(),
        })),
        total: memberships.length,
        user: targetUser,
      },
      200,
    );
  });

export const platformRouter = factory
  .createApp()
  .use(adminMiddleware)
  .route("/", platformOrganizations)
  .route("/", organizationDetail)
  .route("/", platformUsers);
