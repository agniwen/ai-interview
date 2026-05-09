// Permanently bake the upload-time Qwen-OCR parse into a user message before
// it's persisted to chat_message. The parse data lives in `chat_attachment`;
// this helper copies it into the message itself as a `data-resume-parsed`
// part, so future reads don't need to re-fetch the attachment row.
//
// The chat UI ignores unknown `data-*` parts; only the screening agent
// consumes them (see `injectParsedResumesIntoMessages` in screening.ts).

import type { UIMessage } from "ai";
import type { ResumeParserStructured } from "@/server/agents/resume-parser-schema";
import { getUserAttachments } from "@/server/routes/chat/dao/chat-attachments";

const ATTACHMENT_URL_REGEX = /\/api\/chat\/attachments\/([^/?#]+)/;

export const RESUME_PARSED_PART_TYPE = "data-resume-parsed" as const;

export interface ResumeParsedPartData {
  attachmentId: string;
  filename: string;
  parsedText: string | null;
  parsedStructured: ResumeParserStructured;
  parsedPageCount: number | null;
  parsedTextSource: "pdf-parse" | "qwen-ocr";
}

function extractAttachmentId(url: string): string | null {
  return url.match(ATTACHMENT_URL_REGEX)?.[1] ?? null;
}

interface ResumeParsedPart {
  type: typeof RESUME_PARSED_PART_TYPE;
  data: ResumeParsedPartData;
  id?: string;
}

function isResumeParsedPart(part: unknown): part is ResumeParsedPart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: unknown }).type === RESUME_PARSED_PART_TYPE
  );
}

/**
 * Returns a copy of `message` with `data-resume-parsed` parts appended for any
 * PDF file part whose chat_attachment row has a ready parse and which doesn't
 * already carry a baked-in part. Idempotent.
 */
export async function bakeParsedResumesIntoMessage(
  userId: string,
  message: UIMessage,
): Promise<UIMessage> {
  if (message.role !== "user") {
    return message;
  }

  const attachmentIds = new Set<string>();
  const alreadyBaked = new Set<string>();

  for (const part of message.parts) {
    if (part.type === "file" && part.mediaType === "application/pdf") {
      const id = extractAttachmentId(part.url);
      if (id) {
        attachmentIds.add(id);
      }
    } else if (isResumeParsedPart(part)) {
      alreadyBaked.add(part.data.attachmentId);
    }
  }

  const pendingIds = [...attachmentIds].filter((id) => !alreadyBaked.has(id));
  if (pendingIds.length === 0) {
    return message;
  }

  const rows = await getUserAttachments(userId, pendingIds);
  const newParts: typeof message.parts = [...message.parts];
  let appended = false;

  for (const part of message.parts) {
    if (part.type !== "file" || part.mediaType !== "application/pdf") {
      continue;
    }
    const attachmentId = extractAttachmentId(part.url);
    if (!attachmentId || alreadyBaked.has(attachmentId)) {
      continue;
    }
    const row = rows.get(attachmentId);
    if (!row || row.parsedStatus !== "ready" || !row.parsedStructured) {
      continue;
    }

    const filename = part.filename || row.filename || "resume.pdf";
    newParts.push({
      data: {
        attachmentId,
        filename,
        parsedPageCount: row.parsedPageCount,
        parsedStructured: row.parsedStructured,
        parsedText: row.parsedText,
        parsedTextSource: row.parsedTextSource ?? "qwen-ocr",
      },
      id: `parsed-${attachmentId}`,
      type: RESUME_PARSED_PART_TYPE,
    } satisfies ResumeParsedPart);
    appended = true;
  }

  return appended ? { ...message, parts: newParts } : message;
}

export function readResumeParsedPartsFromMessage(message: UIMessage): ResumeParsedPartData[] {
  const out: ResumeParsedPartData[] = [];
  for (const part of message.parts) {
    if (isResumeParsedPart(part)) {
      out.push(part.data);
    }
  }
  return out;
}
