import { zValidator } from "@hono/zod-validator";
import { parseResumeOcrOnly } from "@/lib/server/resume-parse-pipeline";
import { buildAttachmentKeyByHash, putObjectBytes } from "@/lib/server/s3";
import type { AttachmentParseStatus, AttachmentTextSource } from "@arc/db-schema/db-enums";
import { sha256HexOfBytes } from "@/lib/shared/file-hash";
import {
  createAttachment,
  findAttachmentByContentHash,
} from "@/server/routes/chat/dao/chat-attachments";
import { MAX_ATTACHMENT_SIZE, uploadPreflightSchema } from "@/server/routes/chat/schema";
import { factory } from "@/server/factory";

function mediaTypeToExtension(mediaType: string): string {
  if (mediaType === "application/pdf") {
    return "pdf";
  }
  return "bin";
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
  return {
    id: attachmentId,
    parseStatus: parsedStatus,
    ...(parsedStatus === "ready" && {
      parsed: {
        pageCount: parsedPageCount,
        structured: parsedStructured,
        text: parsedText,
        textSource: parsedTextSource,
      },
    }),
    url: `/api/w/${slug}/chat/attachments/${attachmentId}`,
  };
}

export const uploadsRouter = factory
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

    const existing = await findAttachmentByContentHash(hash);
    if (!existing) {
      return c.json({ hit: false } as const);
    }

    const attachmentId = crypto.randomUUID();
    await createAttachment({
      contentHash: hash,
      filename: filename.slice(0, 255),
      id: attachmentId,
      mediaType,
      organizationId: activeOrg.id,
      parsedAt: existing.parsedAt,
      parsedError: existing.parsedError,
      parsedPageCount: existing.parsedPageCount,
      parsedStatus: existing.parsedStatus,
      parsedStructured: existing.parsedStructured,
      parsedText: existing.parsedText,
      parsedTextSource: existing.parsedTextSource,
      size,
      storageKey: existing.storageKey,
      userId: user.id,
    });

    return c.json({
      hit: true as const,
      ...buildUploadResponse({
        attachmentId,
        parsedPageCount: existing.parsedPageCount,
        parsedStatus: existing.parsedStatus,
        parsedStructured: existing.parsedStructured,
        parsedText: existing.parsedText,
        parsedTextSource: existing.parsedTextSource,
        slug: activeOrg.slug,
      }),
    });
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
    if (file.type !== "application/pdf") {
      return c.json({ error: "Unsupported media type" }, 415);
    }
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) {
      return c.json({ error: "File too large" }, 413);
    }

    const filename = file.name.slice(0, 255) || "attachment.pdf";
    const original = new Uint8Array(await file.arrayBuffer());

    // 服务端始终自算 hash，不读客户端声称值。
    // The server always computes the hash itself; client claims are ignored.
    const contentHash = await sha256HexOfBytes(original);

    // 命中既有行：按 hash 全局查 chat_attachment（不做 userId 过滤），命中后给
    // 当前用户新建一条独立 attachment 行——读路径仍按 userId+id 鉴权。
    // 并发 miss：两个请求各自 PUT 同一 hash 命名的 S3 对象（幂等覆盖）+
    // 各自 INSERT 独立 attachmentId，不冲突。
    // Hash hit: lookup is global (no userId filter); on hit we insert a fresh
    // per-user row — the read path remains userId+id scoped, so isolation holds.
    // Concurrent miss: two requests each PUT the same hash-named S3 key
    // (idempotent overwrite) and INSERT independent attachmentIds — no conflict.
    const existing = await findAttachmentByContentHash(contentHash);
    if (existing) {
      const attachmentId = crypto.randomUUID();
      await createAttachment({
        contentHash,
        filename,
        id: attachmentId,
        mediaType: file.type,
        organizationId: activeOrg.id,
        parsedAt: existing.parsedAt,
        parsedError: existing.parsedError,
        parsedPageCount: existing.parsedPageCount,
        parsedStatus: existing.parsedStatus,
        parsedStructured: existing.parsedStructured,
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
          parsedStructured: existing.parsedStructured,
          parsedText: existing.parsedText,
          parsedTextSource: existing.parsedTextSource,
          slug: activeOrg.slug,
        }),
      );
    }

    // 未命中：走原有上传 + 解析路径，但 S3 key 用 hash 命名。
    // Miss: original upload + parse path, but S3 key is derived from the hash.
    const attachmentId = crypto.randomUUID();
    const storageKey = await buildAttachmentKeyByHash(contentHash, mediaTypeToExtension(file.type));

    // pdf-parse / pdfjs may transfer the underlying ArrayBuffer to a worker,
    // detaching the original. Hand out independent copies so the S3 upload
    // and the parse pipeline cannot poison each other.
    const bytesForUpload = new Uint8Array(original);
    const bytesForParse = new Uint8Array(original);

    // 上传与 OCR 并行：S3 失败致命；OCR 失败记录后由后续 LLM 调用兜底。
    // chat 路径不在这里跑结构化抽取 —— 结构化由简历库的 storeInterviewResume
    // 或聊天里的 suggest_job_description 工具按需触发，命中同 hash 时复用并回填。
    // S3 upload + OCR in parallel. S3 failure is fatal; OCR failure is logged
    // and falls back at LLM call time.
    // The chat path no longer runs structured extraction here — that's deferred
    // to studio's storeInterviewResume or the chat-side suggest_job_description
    // tool, both of which backfill the cache by content hash when they do run.
    const [uploadOutcome, parseOutcome] = await Promise.allSettled([
      putObjectBytes({ body: bytesForUpload, contentType: file.type, storageKey }),
      parseResumeOcrOnly(bytesForParse),
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
            // 故意留 null：结构化抽取 lazily 在真正需要时再跑（见 storeInterviewResume
            // 和 suggest_job_description 的 on-demand 分支）。
            // Intentionally null — structured extraction is deferred to whoever
            // actually needs it (see storeInterviewResume / suggest_job_description).
            parsedStructured: null,
            parsedText: parseOutcome.value.text,
            parsedTextSource: parseOutcome.value.textSource,
          }
        : {
            parsedAt: new Date(),
            parsedError: String(parseOutcome.reason).slice(0, 500),
            parsedStatus: "failed" as const,
          };

    if (parseOutcome.status === "rejected") {
      console.error("[chat] resume OCR failed (non-fatal)", parseOutcome.reason);
    }

    await createAttachment({
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
        parsedPageCount: parseOutcome.status === "fulfilled" ? parseOutcome.value.pageCount : null,
        parsedStatus: parseFields.parsedStatus,
        // OCR-only：响应里 structured 总为 null；前端 ParsedResumeButton 与
        // chat-message-item 已兼容这种形态。
        // OCR-only path: structured is always null in the response; the
        // ParsedResumeButton and chat-message-item already handle this case.
        parsedStructured: null,
        parsedText: parseOutcome.status === "fulfilled" ? parseOutcome.value.text : null,
        parsedTextSource:
          parseOutcome.status === "fulfilled" ? parseOutcome.value.textSource : null,
        slug: activeOrg.slug,
      }),
    );
  });
