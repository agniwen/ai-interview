import type { FileUIPart, UIMessage } from "ai";
import type { ChatAttachmentRow } from "@/server/queries/chat-attachments";
import { getObjectBytes } from "@/lib/s3";
import { getUserAttachments } from "@/server/queries/chat-attachments";

const ATTACHMENT_URL_PATTERN = /^\/api\/chat\/attachments\/([A-Za-z0-9-]+)$/;

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
      const id = extractAttachmentId((part as FileUIPart).url);
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
