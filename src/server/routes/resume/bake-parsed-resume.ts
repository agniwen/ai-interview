// Permanently bake the upload-time Qwen-OCR parse into a user message before
// it's persisted to chat_message. The parse data lives in `chat_attachment`;
// this helper copies it into the message itself as a `data-resume-parsed`
// part, so future reads don't need to re-fetch the attachment row.
//
// The chat UI ignores unknown `data-*` parts; only the screening agent
// consumes them (see `injectParsedResumesIntoMessages` in screening.ts).

import type { UIMessage } from "ai";
import type { AttachmentTextSource } from "@/lib/shared/db-enums";
import { structuredSchema } from "@/lib/shared/resume-parser-schema";
import type { ResumeParserStructured } from "@/lib/shared/resume-parser-schema";
import { getUserAttachments } from "@/server/routes/chat/dao/chat-attachments";

// 多租户改造后 URL 形如 /api/w/<slug>/chat/attachments/<id>；旧消息仍是
// /api/chat/attachments/<id>。两种前缀都需要识别，否则历史会话烘焙失败。
// Post multi-tenant URLs are /api/w/<slug>/chat/attachments/<id>; legacy
// messages still carry /api/chat/attachments/<id>. Match either prefix so
// historical conversations still bake correctly.
const ATTACHMENT_URL_REGEX = /\/api\/(?:w\/[^/]+\/)?chat\/attachments\/([^/?#]+)/;

export const RESUME_PARSED_PART_TYPE = "data-resume-parsed" as const;

export interface ResumeParsedPartData {
  attachmentId: string;
  filename: string;
  parsedText: string | null;
  parsedStructured: ResumeParserStructured;
  parsedPageCount: number | null;
  parsedTextSource: AttachmentTextSource;
}

function extractAttachmentId(url: string): string | null {
  return url.match(ATTACHMENT_URL_REGEX)?.[1] ?? null;
}

// 历史脏数据兜底：写入侧已经 sanitize，但 jsonb 列没有数据库层约束，
// 所以读取时再 safeParse 一次，失败/不齐全的 row 直接跳过——下游不再接到坏 LLM 输入。
// Belt-and-suspenders for legacy rows: writes are sanitized, but jsonb has no
// DB-level constraint, so we safeParse on read and skip rows that fail.
function readValidatedStructured(
  row: { parsedStatus: string; parsedStructured: unknown } | undefined,
): ResumeParserStructured | null {
  if (!row || row.parsedStatus !== "ready" || !row.parsedStructured) {
    return null;
  }
  const parsed = structuredSchema.safeParse(row.parsedStructured);
  return parsed.success ? parsed.data : null;
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
    const validated = readValidatedStructured(row);
    if (!row || !validated) {
      continue;
    }

    const filename = part.filename || row.filename || "resume.pdf";
    newParts.push({
      data: {
        attachmentId,
        filename,
        parsedPageCount: row.parsedPageCount,
        parsedStructured: validated,
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
