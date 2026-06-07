import { getObjectStream } from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import { getUserAttachment } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";

export const attachmentsRouter = factory.createApp().get("/:id", async (c) => {
  const { activeOrg, user } = c.var;
  if (!user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  if (!activeOrg) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const id = c.req.param("id");
  const attachment = await getUserAttachment(user.id, activeOrg.id, id);
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
