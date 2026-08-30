import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createRequestWorkspaceAuthorizer } from "@app/server/server/access/workspace-access-policy";
import { resolveRecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
import { legacyUiMessageToArcMessage } from "@app/server/server/agents/mastra/adapters/arc-message-adapter";
import {
  checkConversationOwner,
  deleteUserConversation,
  getUserConversation,
  listUserConversations,
  upsertChatMessage,
  upsertConversation,
} from "@app/server/server/routes/chat/dao/chat";
import {
  patchConversationSchema,
  confirmRecruitingActionSchema,
  upsertChatMessageSchema,
  upsertConversationSchema,
} from "@app/server/server/routes/chat/schema";
import { requirePermission } from "@app/server/server/middlewares/permission";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { confirmRecruitingAction } from "./actions";
import { loadResumeDetail } from "@app/server/server/routes/studio/routes/resumes/dao/resumes";
import { loadResumePoolItem } from "@app/server/server/routes/studio/routes/resume-pool/dao";
import { normalizeResumePoolItemId } from "@app/server/server/agents/mastra/tools/resume-pool-id";

export interface ConversationsRouteDependencies {
  checkConversationOwner: typeof checkConversationOwner;
  confirmRecruitingAction: typeof confirmRecruitingAction;
  createRequestWorkspaceAuthorizer: typeof createRequestWorkspaceAuthorizer;
  deleteUserConversation: typeof deleteUserConversation;
  getUserConversation: typeof getUserConversation;
  listUserConversations: typeof listUserConversations;
  loadResumeDetail: typeof loadResumeDetail;
  loadResumePoolItem: typeof loadResumePoolItem;
  requireResumeLibraryUpdatePermission: ReturnType<typeof requirePermission<"resumeLibrary">>;
  resolveRecruitingVisibilityScope: typeof resolveRecruitingVisibilityScope;
  upsertChatMessage: typeof upsertChatMessage;
  upsertConversation: typeof upsertConversation;
}

const defaultDependencies: ConversationsRouteDependencies = {
  checkConversationOwner,
  confirmRecruitingAction,
  createRequestWorkspaceAuthorizer,
  deleteUserConversation,
  getUserConversation,
  listUserConversations,
  loadResumeDetail,
  loadResumePoolItem,
  requireResumeLibraryUpdatePermission: requirePermission("resumeLibrary", "update"),
  resolveRecruitingVisibilityScope,
  upsertChatMessage,
  upsertConversation,
};

export function createConversationsRouter(
  dependencies: ConversationsRouteDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .get("/", async (c) => {
      const { user, activeOrg } = c.var;
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!activeOrg) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const rows = await dependencies.listUserConversations(user.id, activeOrg.id);
      return c.json(
        {
          conversations: rows.map((row) => ({
            createdAt: row.createdAt.toISOString(),
            id: row.id,
            isTitleGenerating: row.isTitleGenerating,
            title: row.title,
            updatedAt: row.updatedAt.toISOString(),
          })),
        },
        200,
      );
    })
    .post(
      "/",
      zValidator("json", upsertConversationSchema, jsonValidatorError("会话参数无效。")),
      async (c) => {
        const { user, activeOrg } = c.var;
        if (!user) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        if (!activeOrg) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        const input = c.req.valid("json");
        const result = await dependencies.upsertConversation({
          createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
          id: input.id,
          isTitleGenerating: input.isTitleGenerating,
          jobDescription: input.jobDescription,
          jobDescriptionConfig: input.jobDescriptionConfig,
          organizationId: activeOrg.id,
          resumeImports: input.resumeImports,
          title: input.title,
          userId: user.id,
        });

        if (result === "forbidden") {
          return c.json({ error: "Forbidden" }, 403);
        }

        return c.json({ ok: true }, 200);
      },
    )
    .get("/:id", async (c) => {
      const { user, activeOrg } = c.var;
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!activeOrg) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");
      const conversation = await dependencies.getUserConversation(user.id, id, activeOrg.id);
      if (!conversation) {
        return c.json({ error: "Not Found" }, 404);
      }
      const messages = z.array(z.json()).parse(conversation.messages);

      return c.json(
        {
          conversation: {
            createdAt: conversation.createdAt.toISOString(),
            id: conversation.id,
            isTitleGenerating: conversation.isTitleGenerating,
            jobDescription: conversation.jobDescription,
            jobDescriptionConfig: conversation.jobDescriptionConfig,
            messages,
            resumeImports: conversation.resumeImports,
            title: conversation.title,
            updatedAt: conversation.updatedAt.toISOString(),
          },
        },
        200,
      );
    })
    .patch(
      "/:id",
      zValidator("json", patchConversationSchema, jsonValidatorError("会话参数无效。")),
      async (c) => {
        const { user, activeOrg } = c.var;
        if (!user) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        if (!activeOrg) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        const id = c.req.param("id");
        const input = c.req.valid("json");
        const result = await dependencies.upsertConversation({
          id,
          isTitleGenerating: input.isTitleGenerating,
          jobDescription: input.jobDescription,
          jobDescriptionConfig: input.jobDescriptionConfig,
          organizationId: activeOrg.id,
          resumeImports: input.resumeImports,
          title: input.title,
          userId: user.id,
        });

        if (result === "forbidden") {
          return c.json({ error: "Forbidden" }, 403);
        }

        return c.json({ ok: true }, 200);
      },
    )
    .delete("/:id", async (c) => {
      const { user, activeOrg } = c.var;
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!activeOrg) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const id = c.req.param("id");
      const deleted = await dependencies.deleteUserConversation(user.id, id, activeOrg.id);
      if (!deleted) {
        return c.json({ error: "Not Found" }, 404);
      }

      return c.json({ ok: true }, 200);
    })
    .post(
      "/:id/actions/confirm",
      dependencies.requireResumeLibraryUpdatePermission,
      zValidator("json", confirmRecruitingActionSchema, jsonValidatorError("动作参数无效。")),
      async (c) => {
        const { user, activeOrg } = c.var;
        if (!user) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        if (!activeOrg) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        const conversationId = c.req.param("id");
        const owner = await dependencies.checkConversationOwner(
          user.id,
          conversationId,
          activeOrg.id,
        );
        if (owner === "not_found") {
          return c.json({ error: "Not Found" }, 404);
        }
        if (owner === "forbidden") {
          return c.json({ error: "Forbidden" }, 403);
        }

        const { proposal, decision } = c.req.valid("json");
        const visibilityScope = await dependencies.resolveRecruitingVisibilityScope({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        if (decision !== "ignore") {
          if (proposal.type === "bind_pool_item_to_job") {
            const visiblePoolItem = await dependencies.loadResumePoolItem({
              organizationId: activeOrg.id,
              poolItemId: normalizeResumePoolItemId(proposal.payload.poolItemId),
              visibilityScope,
            });
            if (!visiblePoolItem) {
              return c.json({ error: "Not Found" }, 404);
            }
          } else {
            const visibleRecord = await dependencies.loadResumeDetail(
              proposal.payload.resumeRecordId,
              activeOrg.id,
              visibilityScope,
            );
            if (!visibleRecord) {
              return c.json({ error: "Not Found" }, 404);
            }
          }
        }
        const authorize = dependencies.createRequestWorkspaceAuthorizer({
          headers: c.req.raw.headers,
          memberRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const result = await dependencies.confirmRecruitingAction({
          authorize,
          conversationId,
          decision,
          operatorId: user.id,
          organizationId: activeOrg.id,
          proposal,
          visibilityScope,
        });
        const status = result.status === "failed" ? 409 : 200;
        return c.json(result, status);
      },
    )
    .post(
      "/:id/messages",
      zValidator("json", upsertChatMessageSchema, jsonValidatorError("消息参数无效。")),
      async (c) => {
        const { user, activeOrg } = c.var;
        if (!user) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        if (!activeOrg) {
          return c.json({ error: "Unauthorized" }, 401);
        }

        const conversationId = c.req.param("id");
        const owner = await dependencies.checkConversationOwner(
          user.id,
          conversationId,
          activeOrg.id,
        );
        if (owner === "not_found") {
          return c.json({ error: "Not Found" }, 404);
        }
        if (owner === "forbidden") {
          return c.json({ error: "Forbidden" }, 403);
        }

        const { message } = c.req.valid("json");
        try {
          await dependencies.upsertChatMessage({
            conversationId,
            message: legacyUiMessageToArcMessage(message),
            organizationId: activeOrg.id,
          });
        } catch (error) {
          console.error("[chat] failed to upsert message", error);
          return c.json({ error: "Persist failed" }, 500);
        }

        return c.json({ ok: true }, 200);
      },
    );
}

export const conversationsRouter = createConversationsRouter();
