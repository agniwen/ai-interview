import type { UIMessage } from "ai";
import { zValidator } from "@hono/zod-validator";
import { buildAttachmentKey, getObjectStream, putObjectBytes } from "@/lib/s3";
import { createAttachment, getUserAttachment } from "@/server/queries/chat-attachments";
import {
  checkConversationOwner,
  deleteUserConversation,
  getUserConversation,
  listUserConversations,
  upsertChatMessage,
  upsertConversation,
} from "@/server/queries/chat";
import { factory } from "@/server/factory";
import {
  MAX_ATTACHMENT_SIZE,
  patchConversationSchema,
  upsertChatMessageSchema,
  upsertConversationSchema,
} from "./schema";

function mediaTypeToExtension(mediaType: string): string {
  if (mediaType === "application/pdf") {
    return "pdf";
  }
  return "bin";
}

export const chatRouter = factory
  .createApp()
  .get("/conversations", async (c) => {
    const { user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const rows = await listUserConversations(user.id);
    return c.json({
      conversations: rows.map((row) => ({
        createdAt: row.createdAt.getTime(),
        id: row.id,
        isTitleGenerating: row.isTitleGenerating,
        title: row.title,
        updatedAt: row.updatedAt.getTime(),
      })),
    });
  })
  .post("/conversations", zValidator("json", upsertConversationSchema), async (c) => {
    const { user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const input = c.req.valid("json");
    const result = await upsertConversation({
      createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
      id: input.id,
      isTitleGenerating: input.isTitleGenerating,
      jobDescription: input.jobDescription,
      jobDescriptionConfig: input.jobDescriptionConfig,
      resumeImports: input.resumeImports,
      title: input.title,
      userId: user.id,
    });

    if (result === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json({ ok: true });
  })
  .get("/conversations/:id", async (c) => {
    const { user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const conversation = await getUserConversation(user.id, id);
    if (!conversation) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json({
      conversation: {
        createdAt: conversation.createdAt.getTime(),
        id: conversation.id,
        isTitleGenerating: conversation.isTitleGenerating,
        jobDescription: conversation.jobDescription,
        jobDescriptionConfig: conversation.jobDescriptionConfig,
        messages: conversation.messages,
        resumeImports: conversation.resumeImports,
        title: conversation.title,
        updatedAt: conversation.updatedAt.getTime(),
      },
    });
  })
  .patch("/conversations/:id", zValidator("json", patchConversationSchema), async (c) => {
    const { user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const input = c.req.valid("json");
    const result = await upsertConversation({
      id,
      isTitleGenerating: input.isTitleGenerating,
      jobDescription: input.jobDescription,
      jobDescriptionConfig: input.jobDescriptionConfig,
      resumeImports: input.resumeImports,
      title: input.title,
      userId: user.id,
    });

    if (result === "forbidden") {
      return c.json({ error: "Forbidden" }, 403);
    }

    return c.json({ ok: true });
  })
  .delete("/conversations/:id", async (c) => {
    const { user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const deleted = await deleteUserConversation(user.id, id);
    if (!deleted) {
      return c.json({ error: "Not Found" }, 404);
    }

    return c.json({ ok: true });
  })
  .post("/conversations/:id/messages", zValidator("json", upsertChatMessageSchema), async (c) => {
    const { user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const conversationId = c.req.param("id");
    const owner = await checkConversationOwner(user.id, conversationId);
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
      });
    } catch (error) {
      console.error("[chat] failed to upsert message", error);
      return c.json({ error: "Persist failed" }, 500);
    }

    return c.json({ ok: true });
  })
  .post("/uploads", async (c) => {
    const { user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "Missing file" }, 400);
    }
    if (file.type !== "application/pdf") {
      return c.json({ error: "Unsupported media type" }, 415);
    }
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) {
      return c.json({ error: "File too large" }, 413);
    }

    const filename = file.name.slice(0, 255) || "attachment.pdf";
    const attachmentId = crypto.randomUUID();
    const storageKey = await buildAttachmentKey(attachmentId, mediaTypeToExtension(file.type));

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await putObjectBytes({
        body: bytes,
        contentType: file.type,
        storageKey,
      });
    } catch (error) {
      console.error("[chat] failed to upload to storage", error);
      return c.json({ error: "Storage upload failed" }, 500);
    }

    await createAttachment({
      filename,
      id: attachmentId,
      mediaType: file.type,
      size: file.size,
      storageKey,
      userId: user.id,
    });

    return c.json({
      id: attachmentId,
      url: `/api/chat/attachments/${attachmentId}`,
    });
  })
  .get("/attachments/:id", async (c) => {
    const { user } = c.var;
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const id = c.req.param("id");
    const attachment = await getUserAttachment(user.id, id);
    if (!attachment) {
      return c.json({ error: "Not Found" }, 404);
    }

    const object = await getObjectStream(attachment.storageKey);
    if (!object) {
      return c.json({ error: "Not Found" }, 404);
    }

    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(attachment.filename)}"`,
        "Content-Type": object.contentType ?? attachment.mediaType,
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  });
