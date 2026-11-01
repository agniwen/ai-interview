import { zValidator } from "@hono/zod-validator";
import {
  enqueueMailIngestTrigger,
  isMailIngestTriggerQueueConfigured,
} from "@app/job-queues/mail-ingest-trigger";
import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import { z } from "zod";
import { createInternalErrorResponse } from "../../error-handler";
import { factory, jsonValidatorError } from "../../factory";
import {
  createMailIngestAccount,
  getMailIngestAccountLoginConfig,
  getWorkspaceMailIngestAccount,
  isWorkspaceMember,
  listAccountMailMessages,
  mailIngestAccountExistsInOrg,
  queryPaginatedPlatformMailIngestAccounts,
  updateWorkspaceMailIngestAccount,
} from "../studio/routes/mail-ingest/dao";
import {
  createMailIngestAccountSchema,
  listMailMessagesQuerySchema,
  updateMailIngestAccountSchema,
} from "../studio/routes/mail-ingest/schema";
import {
  MailIngestValidationError,
  mergeMailIngestLoginConfig,
  validateMailIngestAccountLogin,
} from "../studio/routes/mail-ingest/validation";

// 平台后台的邮箱监听：跨工作区管理监听账号、查看入库记录并触发立即轮询。
// Platform mailbox listener administration across workspaces.
const mailIngestAccountsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  sortBy: z.enum(["userName", "userEmail", "emailAddress", "lastCheckedAt"]).default("userName"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
  textFilters: listTextFiltersSchema("platformMailAccounts"),
});

const createPlatformMailIngestAccountSchema = createMailIngestAccountSchema.extend({
  organizationId: z.string().trim().min(1),
  userId: z.string().trim().min(1),
});

const updatePlatformMailIngestAccountSchema = updateMailIngestAccountSchema.extend({
  organizationId: z.string().trim().min(1),
});

const platformMailIngestAccountScopeSchema = z.object({
  organizationId: z.string().trim().min(1),
});

const platformMailMessagesQuerySchema = listMailMessagesQuerySchema.extend(
  platformMailIngestAccountScopeSchema.shape,
);

export interface PlatformMailIngestDependencies {
  createMailIngestAccount: typeof createMailIngestAccount;
  enqueueMailIngestTrigger: typeof enqueueMailIngestTrigger;
  getMailIngestAccountLoginConfig: typeof getMailIngestAccountLoginConfig;
  getWorkspaceMailIngestAccount: typeof getWorkspaceMailIngestAccount;
  isMailIngestTriggerQueueConfigured: typeof isMailIngestTriggerQueueConfigured;
  isWorkspaceMember: typeof isWorkspaceMember;
  listAccountMailMessages: typeof listAccountMailMessages;
  mailIngestAccountExistsInOrg: typeof mailIngestAccountExistsInOrg;
  queryPaginatedPlatformMailIngestAccounts: typeof queryPaginatedPlatformMailIngestAccounts;
  updateWorkspaceMailIngestAccount: typeof updateWorkspaceMailIngestAccount;
  validateMailIngestAccountLogin: typeof validateMailIngestAccountLogin;
}

const defaultPlatformMailIngestDependencies: PlatformMailIngestDependencies = {
  createMailIngestAccount,
  enqueueMailIngestTrigger,
  getMailIngestAccountLoginConfig,
  getWorkspaceMailIngestAccount,
  isMailIngestTriggerQueueConfigured,
  isWorkspaceMember,
  listAccountMailMessages,
  mailIngestAccountExistsInOrg,
  queryPaginatedPlatformMailIngestAccounts,
  updateWorkspaceMailIngestAccount,
  validateMailIngestAccountLogin,
};

export function createPlatformMailIngestAccounts(
  dependencies: PlatformMailIngestDependencies = defaultPlatformMailIngestDependencies,
) {
  return factory
    .createApp()
    .get(
      "/mail-ingest-accounts",
      zValidator("query", mailIngestAccountsQuerySchema, jsonValidatorError("参数校验失败")),
      async (c) => {
        const { page, pageSize, search, textFilters, sortBy, sortOrder } = c.req.valid("query");
        const result = await dependencies.queryPaginatedPlatformMailIngestAccounts(
          { search, textFilters },
          { page, pageSize, sortBy, sortOrder },
        );
        return c.json(result, 200);
      },
    )
    .post(
      "/mail-ingest-accounts",
      zValidator(
        "json",
        createPlatformMailIngestAccountSchema,
        jsonValidatorError("邮箱配置无效。"),
      ),
      async (c) => {
        const { organizationId, userId, ...input } = c.req.valid("json");
        const memberExists = await dependencies.isWorkspaceMember({ organizationId, userId });
        if (!memberExists) {
          return c.json({ error: "目标成员不存在。" }, 404);
        }
        try {
          await dependencies.validateMailIngestAccountLogin(input);
          const account = await dependencies.createMailIngestAccount({
            input,
            organizationId,
            userId,
          });
          return c.json(account, 201);
        } catch (error) {
          if (error instanceof MailIngestValidationError) {
            return c.json({ error: error.message }, 400);
          }
          return c.json(
            createInternalErrorResponse({
              context: { organizationId, userId },
              error,
              operation: "platform-mail-ingest-create",
              publicMessage: "邮箱配置保存失败。",
            }),
            500,
          );
        }
      },
    )
    .patch(
      "/mail-ingest-accounts/:id",
      zValidator(
        "json",
        updatePlatformMailIngestAccountSchema,
        jsonValidatorError("邮箱配置无效。"),
      ),
      async (c) => {
        const { organizationId, ...input } = c.req.valid("json");
        try {
          const accountId = c.req.param("id");
          const existing = await dependencies.getMailIngestAccountLoginConfig({
            id: accountId,
            organizationId,
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
          return c.json(
            createInternalErrorResponse({
              context: { accountId: c.req.param("id"), organizationId },
              error,
              operation: "platform-mail-ingest-update",
              publicMessage: "邮箱配置更新失败。",
            }),
            500,
          );
        }
      },
    )
    .get(
      "/mail-ingest-accounts/:id",
      zValidator("query", platformMailIngestAccountScopeSchema, jsonValidatorError("参数校验失败")),
      async (c) => {
        const { organizationId } = c.req.valid("query");
        const row = await dependencies.getWorkspaceMailIngestAccount(
          organizationId,
          c.req.param("id"),
        );
        if (!row?.account) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        return c.json({ ...row, account: row.account }, 200);
      },
    )
    .get(
      "/mail-ingest-accounts/:id/messages",
      zValidator("query", platformMailMessagesQuerySchema, jsonValidatorError("查询参数不合法")),
      async (c) => {
        const { organizationId, ...query } = c.req.valid("query");
        const accountId = c.req.param("id");
        const exists = await dependencies.mailIngestAccountExistsInOrg({
          id: accountId,
          organizationId,
        });
        if (!exists) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        const result = await dependencies.listAccountMailMessages({
          accountId,
          organizationId,
          ...query,
        });
        return c.json(result, 200);
      },
    )
    .post(
      "/mail-ingest-accounts/:id/poll-now",
      zValidator("json", platformMailIngestAccountScopeSchema, jsonValidatorError("参数校验失败")),
      async (c) => {
        const { organizationId } = c.req.valid("json");
        const exists = await dependencies.mailIngestAccountExistsInOrg({
          id: c.req.param("id"),
          organizationId,
        });
        if (!exists) {
          return c.json({ error: "邮箱配置不存在。" }, 404);
        }
        if (!dependencies.isMailIngestTriggerQueueConfigured()) {
          return c.json({ error: "邮箱轮训队列未配置 REDIS_URL。" }, 503);
        }
        try {
          await dependencies.enqueueMailIngestTrigger({ organizationId });
          return c.json({ status: "queued" as const }, 202);
        } catch (error) {
          return c.json(
            createInternalErrorResponse({
              context: { accountId: c.req.param("id"), organizationId },
              error,
              operation: "platform-mail-ingest-poll-now",
              publicMessage: "立即轮询触发失败。",
            }),
            503,
          );
        }
      },
    );
}
