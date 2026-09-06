import { RecruitingReferenceRetentionError } from "@app/database/recruiting-reference-retention";
import { zValidator } from "@hono/zod-validator";
import {
  enqueueMailIngestTrigger,
  isMailIngestTriggerQueueConfigured,
} from "@app/resume-parse-queue/mail-ingest-trigger";
import { isWorkspaceAdministratorRole } from "@app/shared/permissions";
import { factory, jsonValidatorError } from "../../../../factory";
import { createInternalErrorResponse } from "../../../../error-handler";
import {
  createMailIngestAccount,
  deleteMailIngestAccount,
  getMailIngestAccountLoginConfig,
  getWorkspaceMailIngestAccount,
  isWorkspaceMember,
  listAccountMailMessages,
  listMailIngestAccounts,
  mailIngestAccountExistsInOrg,
  queryPaginatedWorkspaceMailIngestAccounts,
  updateMailIngestAccount,
  updateWorkspaceMailIngestAccount,
} from "./dao";
import {
  createMailIngestAccountSchema,
  createManagedMailIngestAccountSchema,
  listMailMessagesQuerySchema,
  managedMailIngestAccountListQuerySchema,
  updateMailIngestAccountSchema,
} from "./schema";
import {
  MailIngestValidationError,
  mergeMailIngestLoginConfig,
  validateMailIngestAccountLogin,
} from "./validation";
import { requirePermission } from "../../../../middlewares/permission";

type MailIngestPermissionAction = "create" | "delete" | "manage" | "read" | "update";
type ResumeEmailIngestPermissionAction = "create" | "delete" | "read" | "update";

export interface MailIngestRouteDependencies {
  createMailIngestAccount: typeof createMailIngestAccount;
  deleteMailIngestAccount: typeof deleteMailIngestAccount;
  enqueueMailIngestTrigger: typeof enqueueMailIngestTrigger;
  getMailIngestAccountLoginConfig: typeof getMailIngestAccountLoginConfig;
  getWorkspaceMailIngestAccount: typeof getWorkspaceMailIngestAccount;
  isMailIngestTriggerQueueConfigured: typeof isMailIngestTriggerQueueConfigured;
  isWorkspaceMember: typeof isWorkspaceMember;
  listAccountMailMessages: typeof listAccountMailMessages;
  listMailIngestAccounts: typeof listMailIngestAccounts;
  mailIngestAccountExistsInOrg: typeof mailIngestAccountExistsInOrg;
  queryPaginatedWorkspaceMailIngestAccounts: typeof queryPaginatedWorkspaceMailIngestAccounts;
  requireMailIngestPermission: (
    action: MailIngestPermissionAction,
  ) => ReturnType<typeof requirePermission<"mailIngestAccount">>;
  requireResumeEmailIngestPermission: (
    action: ResumeEmailIngestPermissionAction,
  ) => ReturnType<typeof requirePermission<"resumeEmailIngest">>;
  updateMailIngestAccount: typeof updateMailIngestAccount;
  updateWorkspaceMailIngestAccount: typeof updateWorkspaceMailIngestAccount;
  validateMailIngestAccountLogin: typeof validateMailIngestAccountLogin;
}

const defaultDependencies: MailIngestRouteDependencies = {
  createMailIngestAccount,
  deleteMailIngestAccount,
  enqueueMailIngestTrigger,
  getMailIngestAccountLoginConfig,
  getWorkspaceMailIngestAccount,
  isMailIngestTriggerQueueConfigured,
  isWorkspaceMember,
  listAccountMailMessages,
  listMailIngestAccounts,
  mailIngestAccountExistsInOrg,
  queryPaginatedWorkspaceMailIngestAccounts,
  requireMailIngestPermission: (action) => requirePermission("mailIngestAccount", action),
  requireResumeEmailIngestPermission: (action) => requirePermission("resumeEmailIngest", action),
  updateMailIngestAccount,
  updateWorkspaceMailIngestAccount,
  validateMailIngestAccountLogin,
};

export function createMailIngestRouter(overrides: Partial<MailIngestRouteDependencies> = {}) {
  const dependencies: MailIngestRouteDependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .get(
      "/managed",
      dependencies.requireMailIngestPermission("manage"),
      zValidator(
        "query",
        managedMailIngestAccountListQuerySchema,
        jsonValidatorError("查询参数无效。"),
      ),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const q = c.req.valid("query");
        const result = await dependencies.queryPaginatedWorkspaceMailIngestAccounts(
          activeOrg.id,
          {
            search: q.search,
            textFilters: q.textFilters,
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
    .post("/managed/poll-now", dependencies.requireMailIngestPermission("manage"), async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      if (!isWorkspaceAdministratorRole(member.role)) {
        return c.json({ message: "Forbidden" }, 403);
      }
      if (!dependencies.isMailIngestTriggerQueueConfigured()) {
        return c.json({ error: "邮箱轮训队列未配置 REDIS_URL。" }, 503);
      }
      try {
        await dependencies.enqueueMailIngestTrigger({
          organizationId: activeOrg.id,
        });
        return c.json({ status: "queued" as const }, 202);
      } catch (error) {
        return c.json(
          createInternalErrorResponse({
            context: { organizationId: activeOrg.id, userId: user.id },
            error,
            operation: "managed-mail-ingest-poll-now",
            publicMessage: "立即轮询触发失败。",
          }),
          503,
        );
      }
    })
    .post(
      "/managed",
      dependencies.requireMailIngestPermission("manage"),
      zValidator(
        "json",
        createManagedMailIngestAccountSchema,
        jsonValidatorError("邮箱配置无效。"),
      ),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const { userId, ...input } = c.req.valid("json");
        const memberExists = await dependencies.isWorkspaceMember({
          organizationId: activeOrg.id,
          userId,
        });
        if (!memberExists) {
          return c.json({ error: "目标成员不存在。" }, 404);
        }
        try {
          await dependencies.validateMailIngestAccountLogin(input);
          const account = await dependencies.createMailIngestAccount({
            input,
            organizationId: activeOrg.id,
            userId,
          });
          return c.json(account, 201);
        } catch (error) {
          if (error instanceof MailIngestValidationError) {
            return c.json({ error: error.message }, 400);
          }
          return c.json(
            createInternalErrorResponse({
              context: { organizationId: activeOrg.id, userId },
              error,
              operation: "managed-mail-ingest-create",
              publicMessage: "邮箱配置保存失败。",
            }),
            500,
          );
        }
      },
    )
    .patch(
      "/managed/:id",
      dependencies.requireMailIngestPermission("manage"),
      zValidator("json", updateMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        try {
          const accountId = c.req.param("id");
          const input = c.req.valid("json");
          const existing = await dependencies.getMailIngestAccountLoginConfig({
            id: accountId,
            organizationId: activeOrg.id,
          });
          if (!existing) {
            return c.json({ error: "邮箱配置不存在。" }, 404);
          }
          await dependencies.validateMailIngestAccountLogin(
            mergeMailIngestLoginConfig(existing, input),
          );
          const account = await dependencies.updateWorkspaceMailIngestAccount({
            id: accountId,
            input,
            organizationId: activeOrg.id,
          });
          if (!account) {
            return c.json({ error: "邮箱配置不存在。" }, 404);
          }
          return c.json(account, 200);
        } catch (error) {
          if (error instanceof MailIngestValidationError) {
            return c.json({ error: error.message }, 400);
          }
          return c.json(
            createInternalErrorResponse({
              context: { accountId: c.req.param("id"), organizationId: activeOrg.id },
              error,
              operation: "managed-mail-ingest-update",
              publicMessage: "邮箱配置更新失败。",
            }),
            500,
          );
        }
      },
    )
    .get("/managed/:id", dependencies.requireMailIngestPermission("manage"), async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const row = await dependencies.getWorkspaceMailIngestAccount(activeOrg.id, c.req.param("id"));
      if (!row?.account) {
        return c.json({ error: "邮箱配置不存在。" }, 404);
      }
      return c.json({ ...row, account: row.account }, 200);
    })
    .get(
      "/managed/:id/messages",
      dependencies.requireMailIngestPermission("manage"),
      zValidator("query", listMailMessagesQuerySchema, jsonValidatorError("查询参数不合法")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const accountId = c.req.param("id");
        const exists = await dependencies.mailIngestAccountExistsInOrg({
          id: accountId,
          organizationId: activeOrg.id,
        });
        if (!exists) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        const q = c.req.valid("query");
        const result = await dependencies.listAccountMailMessages({
          accountId,
          organizationId: activeOrg.id,
          ...q,
        });
        return c.json(result, 200);
      },
    )
    .get("/", dependencies.requireResumeEmailIngestPermission("read"), async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const accounts = await dependencies.listMailIngestAccounts(activeOrg.id, user.id);
      return c.json({ accounts }, 200);
    })
    .post(
      "/",
      dependencies.requireResumeEmailIngestPermission("create"),
      zValidator("json", createMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        try {
          await dependencies.validateMailIngestAccountLogin(c.req.valid("json"));
          const account = await dependencies.createMailIngestAccount({
            input: c.req.valid("json"),
            organizationId: activeOrg.id,
            userId: user.id,
          });
          return c.json(account, 201);
        } catch (error) {
          if (error instanceof MailIngestValidationError) {
            return c.json({ error: error.message }, 400);
          }
          return c.json(
            createInternalErrorResponse({
              context: { organizationId: activeOrg.id, userId: user.id },
              error,
              operation: "mail-ingest-create",
              publicMessage: "邮箱配置保存失败。",
            }),
            500,
          );
        }
      },
    )
    .patch(
      "/:id",
      dependencies.requireResumeEmailIngestPermission("update"),
      zValidator("json", updateMailIngestAccountSchema, jsonValidatorError("邮箱配置无效。")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        try {
          const accountId = c.req.param("id");
          const input = c.req.valid("json");
          const existing = await dependencies.getMailIngestAccountLoginConfig({
            id: accountId,
            organizationId: activeOrg.id,
            userId: user.id,
          });
          if (!existing) {
            return c.json({ error: "邮箱配置不存在。" }, 404);
          }
          await dependencies.validateMailIngestAccountLogin(
            mergeMailIngestLoginConfig(existing, input),
          );
          const account = await dependencies.updateMailIngestAccount({
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
          return c.json(
            createInternalErrorResponse({
              context: { accountId: c.req.param("id"), organizationId: activeOrg.id },
              error,
              operation: "mail-ingest-update",
              publicMessage: "邮箱配置更新失败。",
            }),
            500,
          );
        }
      },
    )
    .delete("/:id", dependencies.requireResumeEmailIngestPermission("delete"), async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      let deleted: boolean;
      try {
        deleted = await dependencies.deleteMailIngestAccount({
          id: c.req.param("id"),
          organizationId: activeOrg.id,
          userId: user.id,
        });
      } catch (error) {
        if (error instanceof RecruitingReferenceRetentionError) {
          return c.json({ error: error.message }, 409);
        }
        throw error;
      }
      if (!deleted) {
        return c.json({ error: "邮箱配置不存在。" }, 404);
      }
      return c.json({ ok: true }, 200);
    })
    .get(
      "/:id/messages",
      dependencies.requireResumeEmailIngestPermission("read"),
      zValidator("query", listMailMessagesQuerySchema, jsonValidatorError("查询参数不合法")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const accountId = c.req.param("id");
        const existing = await dependencies.getMailIngestAccountLoginConfig({
          id: accountId,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        if (!existing) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        const q = c.req.valid("query");
        const result = await dependencies.listAccountMailMessages({
          accountId,
          organizationId: activeOrg.id,
          ...q,
        });
        return c.json(result, 200);
      },
    );
}

export const mailIngestRouter = createMailIngestRouter();
