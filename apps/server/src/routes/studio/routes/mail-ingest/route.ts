import { RecruitingReferenceRetentionError } from "@app/recruiting/reference-retention";
import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "../../../../factory";
import { createInternalErrorResponse } from "../../../../error-handler";
import {
  createMailIngestAccount,
  deleteMailIngestAccount,
  getMailIngestAccountLoginConfig,
  listAccountMailMessages,
  listMailIngestAccounts,
  updateMailIngestAccount,
} from "./dao";
import {
  createMailIngestAccountSchema,
  listMailMessagesQuerySchema,
  updateMailIngestAccountSchema,
} from "./schema";
import {
  MailIngestValidationError,
  mergeMailIngestLoginConfig,
  validateMailIngestAccountLogin,
} from "./validation";
import { requirePermission } from "../../../../middlewares/permission";

type ResumeEmailIngestPermissionAction = "create" | "delete" | "read" | "update";

export interface MailIngestRouteDependencies {
  createMailIngestAccount: typeof createMailIngestAccount;
  deleteMailIngestAccount: typeof deleteMailIngestAccount;
  getMailIngestAccountLoginConfig: typeof getMailIngestAccountLoginConfig;
  listAccountMailMessages: typeof listAccountMailMessages;
  listMailIngestAccounts: typeof listMailIngestAccounts;
  requireResumeEmailIngestPermission: (
    action: ResumeEmailIngestPermissionAction,
  ) => ReturnType<typeof requirePermission<"resumeEmailIngest">>;
  updateMailIngestAccount: typeof updateMailIngestAccount;
  validateMailIngestAccountLogin: typeof validateMailIngestAccountLogin;
}

const defaultDependencies: MailIngestRouteDependencies = {
  createMailIngestAccount,
  deleteMailIngestAccount,
  getMailIngestAccountLoginConfig,
  listAccountMailMessages,
  listMailIngestAccounts,
  requireResumeEmailIngestPermission: (action) => requirePermission("resumeEmailIngest", action),
  updateMailIngestAccount,
  validateMailIngestAccountLogin,
};

export function createMailIngestRouter(overrides: Partial<MailIngestRouteDependencies> = {}) {
  const dependencies: MailIngestRouteDependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
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
