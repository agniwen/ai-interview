import type { UIMessage } from "ai";
import { zValidator } from "@hono/zod-validator";
import {
  checkConversationOwner,
  deleteUserConversation,
  getUserConversation,
  listUserConversations,
  upsertChatMessage,
  upsertConversation,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat";
import {
  patchConversationSchema,
  upsertChatMessageSchema,
  upsertConversationSchema,
} from "@arc/ai-recruitment-copilot-backend/server/routes/chat/schema";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";

export const conversationsRouter = factory
  .createApp()
  .get("/", async (c) => {
    const { user, activeOrg } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    if (!activeOrg) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const rows = await listUserConversations(user.id, activeOrg.id);
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
      const result = await upsertConversation({
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
    const conversation = await getUserConversation(user.id, id, activeOrg.id);
    if (!conversation) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json(
      {
        conversation: {
          createdAt: conversation.createdAt.toISOString(),
          id: conversation.id,
          isTitleGenerating: conversation.isTitleGenerating,
          jobDescription: conversation.jobDescription,
          jobDescriptionConfig: conversation.jobDescriptionConfig,
          messages: conversation.messages,
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
      const result = await upsertConversation({
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
    const deleted = await deleteUserConversation(user.id, id, activeOrg.id);
    if (!deleted) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json({ ok: true }, 200);
  })
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
      const owner = await checkConversationOwner(user.id, conversationId, activeOrg.id);
      if (owner === "not_found") {
        return c.json({ error: "Not Found" }, 404);
      }
      if (owner === "forbidden") {
        return c.json({ error: "Forbidden" }, 403);
      }

      const { message } = c.req.valid("json");
      try {
        await upsertChatMessage({
          conversationId,
          message: message as unknown as UIMessage,
          organizationId: activeOrg.id,
        });
      } catch (error) {
        console.error("[chat] failed to upsert message", error);
        return c.json({ error: "Persist failed" }, 500);
      }

      return c.json({ ok: true }, 200);
    },
  );
