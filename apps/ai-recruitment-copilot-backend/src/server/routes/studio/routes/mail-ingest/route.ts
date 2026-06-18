import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import {
  createMailIngestAccount,
  deleteMailIngestAccount,
  getMailIngestAccountLoginConfig,
  isWorkspaceMember,
  listMailIngestAccounts,
  queryPaginatedWorkspaceMailIngestAccounts,
  updateMailIngestAccount,
  updateWorkspaceMailIngestAccount,
} from "./dao";
import {
  createMailIngestAccountSchema,
  createManagedMailIngestAccountSchema,
  managedMailIngestAccountListQuerySchema,
  updateMailIngestAccountSchema,
} from "./schema";
import {
  MailIngestValidationError,
  mergeMailIngestLoginConfig,
  validateMailIngestAccountLogin,
} from "./validation";

function canManageAllMailIngestAccounts(role?: string | null): boolean {
  return role === "admin" || role === "owner";
}

export const mailIngestRouter = factory
  .createApp()
  .get(
    "/managed",
    zValidator(
      "query",
      managedMailIngestAccountListQuerySchema,
      jsonValidatorError("查询参数无效。"),
    ),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const q = c.req.valid("query");
      const result = await queryPaginatedWorkspaceMailIngestAccounts(
        activeOrg.id,
        {
          search: q.search,
          ...(canManageAllMailIngestAccounts(member?.role) ? {} : { userId: user.id }),
        },
        {
          page: q.page,
          pageSize: q.pageSize,
          sortBy: q.sortBy,
          sortOrder: q.sortOrder,
        },
      );
      return c.json(result, 200);
    },
  )
  .post(
    "/managed",
    zValidator("json", createManagedMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const { userId, ...input } = c.req.valid("json");
      if (!canManageAllMailIngestAccounts(member?.role) && userId !== user.id) {
        return c.json({ message: "Forbidden" }, 403);
      }
      const memberExists = await isWorkspaceMember({ organizationId: activeOrg.id, userId });
      if (!memberExists) {
        return c.json({ error: "目标成员不存在。" }, 404);
      }
      try {
        await validateMailIngestAccountLogin(input);
        const account = await createMailIngestAccount({
          input,
          organizationId: activeOrg.id,
          userId,
        });
        return c.json(account, 201);
      } catch (error) {
        if (error instanceof MailIngestValidationError) {
          return c.json({ error: error.message }, 400);
        }
        console.error("[mail-ingest] managed create account failed:", error);
        return c.json(
          { error: error instanceof Error ? error.message : "邮箱配置保存失败。" },
          500,
        );
      }
    },
  )
  .patch(
    "/managed/:id",
    zValidator("json", updateMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const accountId = c.req.param("id");
        const input = c.req.valid("json");
        const existing = await getMailIngestAccountLoginConfig({
          id: accountId,
          organizationId: activeOrg.id,
          ...(canManageAllMailIngestAccounts(member?.role) ? {} : { userId: user.id }),
        });
        if (!existing) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        await validateMailIngestAccountLogin(mergeMailIngestLoginConfig(existing, input));
        const account = await updateWorkspaceMailIngestAccount({
          id: accountId,
          input,
          organizationId: activeOrg.id,
          ...(canManageAllMailIngestAccounts(member?.role) ? {} : { userId: user.id }),
        });
        if (!account) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        return c.json(account, 200);
      } catch (error) {
        if (error instanceof MailIngestValidationError) {
          return c.json({ error: error.message }, 400);
        }
        console.error("[mail-ingest] managed update account failed:", error);
        return c.json(
          { error: error instanceof Error ? error.message : "邮箱配置更新失败。" },
          500,
        );
      }
    },
  )
  .get("/", async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const accounts = await listMailIngestAccounts(activeOrg.id, user.id);
    return c.json({ accounts }, 200);
  })
  .post(
    "/",
    zValidator("json", createMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        await validateMailIngestAccountLogin(c.req.valid("json"));
        const account = await createMailIngestAccount({
          input: c.req.valid("json"),
          organizationId: activeOrg.id,
          userId: user.id,
        });
        return c.json(account, 201);
      } catch (error) {
        if (error instanceof MailIngestValidationError) {
          return c.json({ error: error.message }, 400);
        }
        console.error("[mail-ingest] create account failed:", error);
        return c.json(
          { error: error instanceof Error ? error.message : "邮箱配置保存失败。" },
          500,
        );
      }
    },
  )
  .patch(
    "/:id",
    zValidator("json", updateMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      try {
        const accountId = c.req.param("id");
        const input = c.req.valid("json");
        const existing = await getMailIngestAccountLoginConfig({
          id: accountId,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        if (!existing) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        await validateMailIngestAccountLogin(mergeMailIngestLoginConfig(existing, input));
        const account = await updateMailIngestAccount({
          id: accountId,
          input,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        if (!account) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        return c.json(account, 200);
      } catch (error) {
        if (error instanceof MailIngestValidationError) {
          return c.json({ error: error.message }, 400);
        }
        console.error("[mail-ingest] update account failed:", error);
        return c.json(
          { error: error instanceof Error ? error.message : "邮箱配置更新失败。" },
          500,
        );
      }
    },
  )
  .delete("/:id", async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const deleted = await deleteMailIngestAccount({
      id: c.req.param("id"),
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (!deleted) {
      return c.json({ error: "邮箱配置不存在。" }, 404);
    }
    return c.json({ ok: true }, 200);
  });
