import { zValidator } from "@hono/zod-validator";
import { parseResumeDocument } from "@server/lib/server/resume-parse-pipeline";
import type { ParsedResumeDocument } from "@server/lib/server/resume-parse-pipeline";
import { isResumeParseCacheSourceCompatible } from "@server/lib/server/resume-parse-provider";
import {
  getResumeDocumentExtension,
  isSupportedResumeDocumentInput,
} from "@app/shared/resume-documents";
import { buildAttachmentKeyByHash, putObjectBytes } from "@app/object-storage";
import { isResumeParseCacheEnabled } from "@server/lib/server/resume-parse-cache-policy";
import type { AttachmentParseStatus, AttachmentTextSource } from "@app/db-schema/db-enums";
import { isResumeStructuredSourceFileNameCompatible } from "@app/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@app/db-schema/resume-parser-schema";
import { sha256HexOfBytes } from "@app/shared/file-hash";
import { createAttachment, findAttachmentByContentHash } from "../../dao/chat-attachments";
import type { ChatAttachmentRow } from "../../dao/chat-attachments";
import { MAX_ATTACHMENT_SIZE, uploadPreflightSchema } from "../../schema";
import { factory } from "../../../../factory";

export interface UploadsRouterDependencies {
  buildAttachmentKey: typeof buildAttachmentKeyByHash;
  createAttachment: typeof createAttachment;
  findAttachment: typeof findAttachmentByContentHash;
  parseDocument: typeof parseResumeDocument;
  putObject: typeof putObjectBytes;
  sha256: typeof sha256HexOfBytes;
}

const defaultDependencies: UploadsRouterDependencies = {
  buildAttachmentKey: buildAttachmentKeyByHash,
  createAttachment,
  findAttachment: findAttachmentByContentHash,
  parseDocument: parseResumeDocument,
  putObject: putObjectBytes,
  sha256: sha256HexOfBytes,
};

function getParsedStructured(parsed: ParsedResumeDocument) {
  return "structured" in parsed ? parsed.structured : null;
}

function getFilenameCompatibleStructured(
  structured: ResumeParserStructured | null,
  fileName: string,
): ResumeParserStructured | null {
  return structured && isResumeStructuredSourceFileNameCompatible(structured, fileName)
    ? structured
    : null;
}

type ReusableParsedAttachment = ChatAttachmentRow & {
  parsedPageCount: number;
  parsedStatus: "ready";
  parsedText: string;
  parsedTextSource: AttachmentTextSource;
};

function isReusableParsedAttachment(
  attachment: ChatAttachmentRow | null,
): attachment is ReusableParsedAttachment {
  return Boolean(
    attachment &&
    attachment.parsedStatus === "ready" &&
    attachment.parsedPageCount !== null &&
    attachment.parsedText !== null &&
    attachment.parsedTextSource !== null &&
    isResumeParseCacheSourceCompatible(attachment.parsedTextSource),
  );
}

// 构造上传/preflight 共用的响应结构。
// 多租户改造后 chat 路由挂在 /api/w/:slug/chat 下，必须把 slug 拼进附件 URL，
// 否则浏览器拉 `/api/chat/attachments/:id` 直接 404，预览/下载全坏。
// Build the upload/preflight shared response shape.
// After the multi-tenant move, chat routes live under /api/w/:slug/chat, so the
// slug must be embedded in the attachment URL — otherwise the browser hits
// `/api/chat/attachments/:id` and 404s, breaking preview and download.
function buildUploadResponse(args: {
  slug: string;
  attachmentId: string;
  parsedStatus: AttachmentParseStatus;
  parsedPageCount: number | null;
  parsedStructured: unknown;
  parsedText: string | null;
  parsedTextSource: AttachmentTextSource | null;
}) {
  const {
    slug,
    attachmentId,
    parsedStatus,
    parsedPageCount,
    parsedStructured,
    parsedText,
    parsedTextSource,
  } = args;
  const parsed =
    parsedStatus === "ready" &&
    parsedPageCount !== null &&
    parsedText !== null &&
    parsedTextSource !== null
      ? {
          pageCount: parsedPageCount,
          structured: parsedStructured,
          text: parsedText,
          textSource: parsedTextSource,
        }
      : null;
  return {
    id: attachmentId,
    parseStatus: parsedStatus,
    ...(parsed && { parsed }),
    url: `/api/w/${slug}/chat/attachments/${attachmentId}`,
  };
}

export function createUploadsRouter(overrides: Partial<UploadsRouterDependencies> = {}) {
  const dependencies: UploadsRouterDependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .post("/preflight", zValidator("json", uploadPreflightSchema), async (c) => {
      const { user, activeOrg } = c.var;
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!activeOrg) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const { filename, hash, mediaType, size } = c.req.valid("json");

      const cached = isResumeParseCacheEnabled() ? await dependencies.findAttachment(hash) : null;
      const existing = isReusableParsedAttachment(cached) ? cached : null;
      if (!existing) {
        return c.json({ hit: false } as const, 200);
      }
      const parsedStructured = getFilenameCompatibleStructured(existing.parsedStructured, filename);

      const attachmentId = crypto.randomUUID();
      await dependencies.createAttachment({
        contentHash: hash,
        filename: filename.slice(0, 255),
        id: attachmentId,
        mediaType,
        organizationId: activeOrg.id,
        parsedAt: existing.parsedAt,
        parsedError: existing.parsedError,
        parsedPageCount: existing.parsedPageCount,
        parsedStatus: existing.parsedStatus,
        parsedStructured,
        parsedText: existing.parsedText,
        parsedTextSource: existing.parsedTextSource,
        size,
        storageKey: existing.storageKey,
        userId: user.id,
      });

      return c.json(
        {
          hit: true as const,
          ...buildUploadResponse({
            attachmentId,
            parsedPageCount: existing.parsedPageCount,
            parsedStatus: existing.parsedStatus,
            parsedStructured,
            parsedText: existing.parsedText,
            parsedTextSource: existing.parsedTextSource,
            slug: activeOrg.slug,
          }),
        },
        200,
      );
    })
    .post("/", async (c) => {
      const { user, activeOrg } = c.var;
      if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      if (!activeOrg) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const form = await c.req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return c.json({ error: "Missing file" }, 400);
      }
      if (!isSupportedResumeDocumentInput({ fileName: file.name, mediaType: file.type })) {
        return c.json({ error: "Unsupported media type" }, 415);
      }
      if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) {
        return c.json({ error: "File too large" }, 413);
      }

      const filename = file.name.slice(0, 255) || "attachment.pdf";
      const original = new Uint8Array(await file.arrayBuffer());

      // 服务端始终自算 hash，不读客户端声称值。
      // The server always computes the hash itself; client claims are ignored.
      const contentHash = await dependencies.sha256(original);

      // 命中既有行：按 hash 全局查 chat_attachment（不做 userId 过滤），命中后给
      // 当前用户新建一条独立 attachment 行——读路径仍按 userId+id 鉴权。
      // 并发 miss：两个请求各自 PUT 同一 hash 命名的 S3 对象（幂等覆盖）+
      // 各自 INSERT 独立 attachmentId，不冲突。
      // Hash hit: lookup is global (no userId filter); on hit we insert a fresh
      // per-user row — the read path remains userId+id scoped, so isolation holds.
      // Concurrent miss: two requests each PUT the same hash-named S3 key
      // (idempotent overwrite) and INSERT independent attachmentIds — no conflict.
      const cached = isResumeParseCacheEnabled()
        ? await dependencies.findAttachment(contentHash)
        : null;
      const existing = isReusableParsedAttachment(cached) ? cached : null;
      if (existing) {
        const parsedStructured = getFilenameCompatibleStructured(
          existing.parsedStructured,
          filename,
        );
        const attachmentId = crypto.randomUUID();
        await dependencies.createAttachment({
          contentHash,
          filename,
          id: attachmentId,
          mediaType: file.type,
          organizationId: activeOrg.id,
          parsedAt: existing.parsedAt,
          parsedError: existing.parsedError,
          parsedPageCount: existing.parsedPageCount,
          parsedStatus: existing.parsedStatus,
          parsedStructured,
          parsedText: existing.parsedText,
          parsedTextSource: existing.parsedTextSource,
          size: file.size,
          storageKey: existing.storageKey,
          userId: user.id,
        });

        return c.json(
          buildUploadResponse({
            attachmentId,
            parsedPageCount: existing.parsedPageCount,
            parsedStatus: existing.parsedStatus,
            parsedStructured,
            parsedText: existing.parsedText,
            parsedTextSource: existing.parsedTextSource,
            slug: activeOrg.slug,
          }),
        );
      }

      // 未命中：走原有上传 + 解析路径，但 S3 key 用 hash 命名。
      // Miss: original upload + parse path, but S3 key is derived from the hash.
      const attachmentId = crypto.randomUUID();
      const storageKey = await dependencies.buildAttachmentKey(
        contentHash,
        getResumeDocumentExtension({ fileName: file.name, mediaType: file.type }),
      );

      // Some parsers may transfer or consume the underlying ArrayBuffer. Hand out
      // independent copies so the S3 upload and parse pipeline cannot poison each
      // other.
      const bytesForUpload = new Uint8Array(original);
      const bytesForParse = new Uint8Array(original);

      // 上传与解析并行。默认 OCR + LLM 模式仍只提取文本并延迟结构化；
      // 阿里云文档挖掘模式一次返回完整结构化结果。
      // Upload and parsing run in parallel. The default OCR + LLM mode keeps
      // structure extraction lazy; Aliyun document mining returns it immediately.
      const [uploadOutcome, parseOutcome] = await Promise.allSettled([
        dependencies.putObject({ body: bytesForUpload, contentType: file.type, storageKey }),
        dependencies.parseDocument({
          bytes: bytesForParse,
          fileName: file.name,
          mediaType: file.type,
        }),
      ]);

      if (uploadOutcome.status === "rejected") {
        console.error("[chat] failed to upload to storage", uploadOutcome.reason);
        return c.json({ error: "Storage upload failed" }, 500);
      }

      const parseFields =
        parseOutcome.status === "fulfilled"
          ? {
              parsedAt: new Date(),
              parsedPageCount: parseOutcome.value.pageCount,
              parsedStatus: "ready" as const,
              parsedStructured: getParsedStructured(parseOutcome.value),
              parsedText: parseOutcome.value.text,
              parsedTextSource: parseOutcome.value.textSource,
            }
          : {
              parsedAt: new Date(),
              parsedError: String(parseOutcome.reason).slice(0, 500),
              parsedStatus: "failed" as const,
            };

      if (parseOutcome.status === "rejected") {
        console.error("[chat] resume text extraction failed (non-fatal)", parseOutcome.reason);
      }

      await dependencies.createAttachment({
        contentHash,
        filename,
        id: attachmentId,
        mediaType: file.type,
        organizationId: activeOrg.id,
        size: file.size,
        storageKey,
        userId: user.id,
        ...parseFields,
      });

      return c.json(
        buildUploadResponse({
          attachmentId,
          parsedPageCount:
            parseOutcome.status === "fulfilled" ? parseOutcome.value.pageCount : null,
          parsedStatus: parseFields.parsedStatus,
          parsedStructured:
            parseOutcome.status === "fulfilled" ? getParsedStructured(parseOutcome.value) : null,
          parsedText: parseOutcome.status === "fulfilled" ? parseOutcome.value.text : null,
          parsedTextSource:
            parseOutcome.status === "fulfilled" ? parseOutcome.value.textSource : null,
          slug: activeOrg.slug,
        }),
      );
    });
}

export const uploadsRouter = createUploadsRouter();
