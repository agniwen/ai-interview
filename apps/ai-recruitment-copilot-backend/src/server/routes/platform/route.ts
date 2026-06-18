import { z } from "zod";
import { eq, sql, count, ilike, or, desc, asc } from "drizzle-orm";
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { adminMiddleware } from "@arc/ai-recruitment-copilot-backend/server/middlewares/admin";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { organization, member, session, user } from "@arc/db-schema/schema";
import {
  getResumeParseQueueOverview,
  listResumeParseQueueJobs,
  RESUME_PARSE_JOB_LIST_STATES,
  RESUME_PARSE_QUEUE_NAME,
} from "@arc/resume-parse-queue/resume-parse";
import {
  createMailIngestAccount,
  getMailIngestAccountLoginConfig,
  isWorkspaceMember,
  queryPaginatedPlatformMailIngestAccounts,
  updateWorkspaceMailIngestAccount,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/dao";
import {
  createMailIngestAccountSchema,
  updateMailIngestAccountSchema,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/schema";
import {
  MailIngestValidationError,
  mergeMailIngestLoginConfig,
  validateMailIngestAccountLogin,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/mail-ingest/validation";
import { enrichResumeParseQueueJobs } from "./queue-details";

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
  sortBy: z.enum(["name", "email", "role", "createdAt", "lastActiveAt"]).default("lastActiveAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

const LAST_ACTIVE_AT_EXPR = sql<Date | string | null>`GREATEST(
  MAX(${session.updatedAt}),
  MAX(${user.lastActiveAt})
)`;
const LAST_ACTIVE_AT_SELECT_SQL = sql<Date | string | null>`${LAST_ACTIVE_AT_EXPR}`.as(
  "last_active_at",
);

function userOrderBy(sortBy: string, sortOrder: "asc" | "desc") {
  if (sortBy === "lastActiveAt") {
    const direction = sortOrder === "asc" ? sql`asc` : sql`desc`;
    return [sql`${LAST_ACTIVE_AT_EXPR} ${direction} nulls last`, desc(user.createdAt)];
  }
  const orderDir = sortOrder === "asc" ? asc : desc;
  if (sortBy === "name") {
    return [orderDir(user.name), desc(user.createdAt)];
  }
  if (sortBy === "email") {
    return [orderDir(user.email), desc(user.createdAt)];
  }
  if (sortBy === "role") {
    return [orderDir(user.role), desc(user.createdAt)];
  }
  return [orderDir(user.createdAt)];
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
            lastActiveAt: LAST_ACTIVE_AT_SELECT_SQL,
            name: user.name,
            role: user.role,
            updatedAt: user.updatedAt,
          })
          .from(user)
          .leftJoin(session, eq(session.userId, user.id))
          .where(searchFilter)
          .groupBy(user.id)
          .orderBy(...userOrderBy(sortBy, sortOrder))
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

const mailIngestAccountsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(["userName", "userEmail", "emailAddress", "lastCheckedAt"]).default("userName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

const createPlatformMailIngestAccountSchema = createMailIngestAccountSchema.extend({
  organizationId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

const updatePlatformMailIngestAccountSchema = updateMailIngestAccountSchema.extend({
  organizationId: z.string().trim().min(1),
});

const platformMailIngestAccounts = factory
  .createApp()
  .get(
    "/mail-ingest-accounts",
    zValidator("query", mailIngestAccountsQuerySchema, jsonValidatorError("参数校验失败")),
    async (c) => {
      const { page, pageSize, search, sortBy, sortOrder } = c.req.valid("query");
      const result = await queryPaginatedPlatformMailIngestAccounts(
        { search },
        { page, pageSize, sortBy, sortOrder },
      );
      return c.json(result, 200);
    },
  )
  .post(
    "/mail-ingest-accounts",
    zValidator("json", createPlatformMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
    async (c) => {
      const { organizationId, userId, ...input } = c.req.valid("json");
      const memberExists = await isWorkspaceMember({ organizationId, userId });
      if (!memberExists) {
        return c.json({ error: "目标成员不存在。" }, 404);
      }
      try {
        await validateMailIngestAccountLogin(input);
        const account = await createMailIngestAccount({
          input,
          organizationId,
          userId,
        });
        return c.json(account, 201);
      } catch (error) {
        if (error instanceof MailIngestValidationError) {
          return c.json({ error: error.message }, 400);
        }
        console.error("[platform-mail-ingest] create account failed:", error);
        return c.json(
          { error: error instanceof Error ? error.message : "邮箱配置保存失败。" },
          500,
        );
      }
    },
  )
  .patch(
    "/mail-ingest-accounts/:id",
    zValidator("json", updatePlatformMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
    async (c) => {
      const { organizationId, ...input } = c.req.valid("json");
      try {
        const accountId = c.req.param("id");
        const existing = await getMailIngestAccountLoginConfig({
          id: accountId,
          organizationId,
        });
        if (!existing) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        await validateMailIngestAccountLogin(mergeMailIngestLoginConfig(existing, input));
        const account = await updateWorkspaceMailIngestAccount({
          id: accountId,
          input,
          organizationId,
        });
        if (!account) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        return c.json(account, 200);
      } catch (error) {
        if (error instanceof MailIngestValidationError) {
          return c.json({ error: error.message }, 400);
        }
        console.error("[platform-mail-ingest] update account failed:", error);
        return c.json(
          { error: error instanceof Error ? error.message : "邮箱配置更新失败。" },
          500,
        );
      }
    },
  );

const queueJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  state: z.enum(RESUME_PARSE_JOB_LIST_STATES).default("all"),
});

const platformQueues = factory
  .createApp()
  .get("/queues", async (c) => {
    const overview = await getResumeParseQueueOverview();
    return c.json({ records: [overview], total: 1 }, 200);
  })
  .get(
    "/queues/:queueName/jobs",
    zValidator("query", queueJobsQuerySchema, jsonValidatorError("参数校验失败")),
    async (c) => {
      const queueName = c.req.param("queueName");
      if (queueName !== RESUME_PARSE_QUEUE_NAME) {
        return c.json({ error: "队列不存在" }, 404);
      }
      const query = c.req.valid("query");
      const result = await listResumeParseQueueJobs(query);
      return c.json(await enrichResumeParseQueueJobs(result), 200);
    },
  );

export const platformRouter = factory
  .createApp()
  .use(adminMiddleware)
  .route("/", platformQueues)
  .route("/", platformMailIngestAccounts)
  .route("/", platformOrganizations)
  .route("/", organizationDetail)
  .route("/", platformUsers);
