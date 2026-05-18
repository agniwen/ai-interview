import type { FileUIPart, UIMessage } from "ai";
import type { ChatAttachmentRow } from "@/server/routes/chat/dao/chat-attachments";
import { getObjectBytes } from "@/lib/server/s3";
import { getUserAttachments } from "@/server/routes/chat/dao/chat-attachments";

// 多租户改造后 URL 形如 /api/w/<slug>/chat/attachments/<id>；旧消息仍持有
// /api/chat/attachments/<id>。为了让历史会话回放也能 inline，两种前缀都接。
// After the multi-tenant move URLs look like /api/w/<slug>/chat/attachments/<id>,
// but legacy messages still hold /api/chat/attachments/<id>. Accept both so
// history replays keep working.
const ATTACHMENT_URL_PATTERN = /^\/api\/(?:w\/[^/]+\/)?chat\/attachments\/([A-Za-z0-9-]+)$/;

function extractAttachmentId(url: string | undefined): string | null {
  if (!url) {
    return null;
  }
  const match = url.match(ATTACHMENT_URL_PATTERN);
  return match?.[1] ?? null;
}

function collectAttachmentIds(messages: UIMessage[]): string[] {
  const ids = new Set<string>();
  for (const message of messages) {
    if (!Array.isArray(message.parts)) {
      continue;
    }
    for (const part of message.parts) {
      if (part.type !== "file") {
        continue;
      }
      // 只采集图片 attachment 的 id —— inlineMessage 也只 inline 图片，
      // PDF 等被下游丢掉，没必要拉它们的 chat_attachment 行。
      // Only collect image attachment ids — inlineMessage skips non-images,
      // and they get stripped downstream, so don't fetch their rows.
      const filePart = part as FileUIPart;
      if (!filePart.mediaType?.startsWith("image/")) {
        continue;
      }
      const id = extractAttachmentId(filePart.url);
      if (id) {
        ids.add(id);
      }
    }
  }
  return [...ids];
}

async function inlineMessage(
  message: UIMessage,
  attachments: Map<string, ChatAttachmentRow>,
): Promise<UIMessage> {
  if (!Array.isArray(message.parts)) {
    return message;
  }

  let touched = false;
  const nextParts = await Promise.all(
    message.parts.map(async (part) => {
      if (part.type !== "file") {
        return part;
      }
      const filePart = part as FileUIPart;
      // 只对图片做 base64 inline —— 非图片(主要是 PDF)的 file part 会在下游
      // stripNonImageFileParts 阶段被丢掉，inline 它们 = S3 读 + base64 编码全白做。
      // 简历的解析内容已经通过 data-resume-parsed → text part 注入到消息里，
      // 模型不需要拿到 PDF 原文件。
      // Only base64-inline images. Non-image file parts (mainly PDFs) get
      // dropped later by stripNonImageFileParts, so inlining them = wasted
      // S3 read + base64 encode per request. Resume content is already
      // surfaced into the message via the data-resume-parsed → text part path.
      if (!filePart.mediaType?.startsWith("image/")) {
        return part;
      }
      const attachmentId = extractAttachmentId(filePart.url);
      if (!attachmentId) {
        return part;
      }

      const attachment = attachments.get(attachmentId);
      if (!attachment) {
        // Not owned by this user — strip the url so downstream does not leak
        // a dangling reference to the model.
        touched = true;
        return { ...filePart, url: "" } satisfies FileUIPart;
      }

      const object = await getObjectBytes(attachment.storageKey);
      if (!object) {
        touched = true;
        return { ...filePart, url: "" } satisfies FileUIPart;
      }

      const base64 = Buffer.from(object.bytes).toString("base64");
      const mediaType = object.contentType || attachment.mediaType;
      touched = true;
      return {
        ...filePart,
        mediaType,
        url: `data:${mediaType};base64,${base64}`,
      } satisfies FileUIPart;
    }),
  );

  if (!touched) {
    return message;
  }
  return { ...message, parts: nextParts } as UIMessage;
}

/**
 * Walks messages and replaces any file part whose url points to our
 * /api/chat/attachments/:id endpoint with a base64 data URL pulled from S3.
 * Verifies that each referenced attachment belongs to the given user.
 * Returns new message objects; the input is not mutated.
 */
export async function inlineAttachmentsForModel(
  userId: string,
  messages: UIMessage[],
): Promise<UIMessage[]> {
  const attachmentIds = collectAttachmentIds(messages);
  const attachments = await getUserAttachments(userId, attachmentIds);
  return Promise.all(messages.map((message) => inlineMessage(message, attachments)));
}
