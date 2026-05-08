# 简历上传内容哈希去重 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 chat 与 studio_interview 两条简历上传路径加入基于 SHA-256 的内容哈希去重——同一文件二次上传不再重复 PUT S3，也不再重复跑解析。

**Architecture:** 不引入新表，直接在 `chat_attachment` / `studio_interview` 上加 `content_hash` 列。上传时先按 hash 查既有行，命中则复制 storageKey + 解析结果到新行，否则按 `chat-attachments/{hash}.pdf` / `studio-resumes/{hash}.pdf` 规范键写入。客户端在 chat 路径增加 SHA-256 + preflight 探测；studio 路径仅服务端去重。详见 `docs/superpowers/specs/2026-05-08-resume-upload-dedup-design.md`。

**Tech Stack:** Next.js 16 App Router、Hono 路由、Drizzle ORM、PostgreSQL、Vitest、`crypto.subtle.digest('SHA-256')`（浏览器与 Node 20+ 均可用）。

---

## File Structure

**新增**

- `src/lib/file-hash.ts` — 同构 SHA-256 工具：`sha256HexOfFile(File)` / `sha256HexOfBytes(Uint8Array)`。
- `src/server/routes/chat/__tests__/route.test.ts`（如不存在） + `src/server/routes/chat/__tests__/upload-dedup.test.ts` — preflight 与上传去重的单元/集成测试。
- `src/lib/__tests__/file-hash.test.ts` — sha256 工具单测。

**修改**

- `src/lib/db/schema.ts` — `chat_attachment` 加 `contentHash` + 索引；`studio_interview` 加 `resumeContentHash` + 索引。
- `src/lib/s3.ts` — 新增 `buildAttachmentKeyByHash(hash)` 与 `buildInterviewResumeKeyByHash(hash)`。
- `src/server/queries/chat-attachments.ts` — 加 `findAttachmentByContentHash(hash)`；`createAttachment` 入参类型加 `contentHash`。
- `src/server/routes/chat/route.ts` — `POST /uploads` 改为 hash 优先；新增 `POST /uploads/preflight`。
- `src/lib/api/endpoints/chat.ts` — `uploadAttachment` 内部加 preflight 流程；新增 `UploadPreflightResponse` 类型。
- `src/server/routes/interview/utils.ts` — `storeInterviewResume` 改为返回 `{ storageKey, contentHash } | null` 并在表内自查去重。
- `src/server/routes/interview/route.ts` — POST/PATCH 两处调用点同时写 `resumeStorageKey` 与 `resumeContentHash`。

**不动**

- `chat_attachment` 老行（contentHash 保持 NULL，storageKey 保留旧 uuid 命名）。
- `studio_interview` 老行（resumeContentHash 保持 NULL）。
- 读路径 `GET /api/chat/attachments/:id` 与 `GET /api/studio/interviews/:id/resume`。
- `buildAttachmentKey(uuid, ext)` 与 `buildInterviewResumeKey(interviewRecordId)` 函数本身（保留以备 backfill）。

---

## Task 1: 新增 SHA-256 工具

**Files:**

- Create: `src/lib/file-hash.ts`
- Test: `src/lib/__tests__/file-hash.test.ts`

- [ ] **Step 1: 写失败的测试**

```ts
// src/lib/__tests__/file-hash.test.ts
import { describe, expect, it } from "vitest";
import { sha256HexOfBytes, sha256HexOfFile } from "@/lib/file-hash";

describe("sha256Hex helpers", () => {
  // Known SHA-256 of the empty string
  const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  // Known SHA-256 of UTF-8 "hello"
  const HELLO_HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  it("sha256HexOfBytes: empty input matches RFC vector", async () => {
    const hex = await sha256HexOfBytes(new Uint8Array());
    expect(hex).toBe(EMPTY_HASH);
  });

  it("sha256HexOfBytes: 'hello' matches RFC vector", async () => {
    const hex = await sha256HexOfBytes(new TextEncoder().encode("hello"));
    expect(hex).toBe(HELLO_HASH);
  });

  it("sha256HexOfFile: matches sha256HexOfBytes on the same content", async () => {
    const file = new File([new TextEncoder().encode("hello")], "hello.txt", {
      type: "text/plain",
    });
    const hex = await sha256HexOfFile(file);
    expect(hex).toBe(HELLO_HASH);
  });

  it("sha256HexOfBytes: returns 64-char lowercase hex", async () => {
    const hex = await sha256HexOfBytes(new TextEncoder().encode("any"));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test src/lib/__tests__/file-hash.test.ts`
Expected: FAIL — module 不存在 / `sha256HexOfBytes is not a function`。

- [ ] **Step 3: 实现工具**

```ts
// src/lib/file-hash.ts
// 同构 SHA-256 hex 工具：浏览器与 Node 20+ 都通过 globalThis.crypto.subtle 工作。
// Isomorphic SHA-256 hex helper backed by globalThis.crypto.subtle (browser & Node 20+).

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

export async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bufferToHex(digest);
}

export async function sha256HexOfFile(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(digest);
}

const HASH_RE = /^[0-9a-f]{64}$/;

export function isValidSha256Hex(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test src/lib/__tests__/file-hash.test.ts`
Expected: PASS（4 个用例）。

- [ ] **Step 5: Commit**

```bash
git add src/lib/file-hash.ts src/lib/__tests__/file-hash.test.ts
git commit -m "feat(lib): add isomorphic sha256 hex helpers"
```

---

## Task 2: Schema 加列与索引

**Files:**

- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: 给 `chat_attachment` 加 `contentHash` 列**

打开 `src/lib/db/schema.ts`。在 `chatAttachment` 表（约 481–505 行）的字段列表中插入新列；位置按字母序紧跟 `createdAt` 之后：

```ts
contentHash: text("content_hash"),
```

并在 `(table) => [...]` 索引数组里加：

```ts
index("chat_attachment_content_hash_idx").on(table.contentHash),
```

最终 `chatAttachment` 索引数组同时含 `chat_attachment_user_id_idx` 与新增的 `chat_attachment_content_hash_idx`。

- [ ] **Step 2: 给 `studio_interview` 加 `resumeContentHash` 列**

在 `studioInterview` 表（约 191–224 行）字段列表中，紧跟 `resumeStorageKey` 之后插入：

```ts
resumeContentHash: text("resume_content_hash"),
```

并在索引数组里追加：

```ts
index("studio_interview_resume_hash_idx").on(table.resumeContentHash),
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 通过。drizzle-orm 推断的 `$inferInsert` / `$inferSelect` 自动包含两个新可空字段。

- [ ] **Step 4: 推送 schema 到本地数据库**

Run: `pnpm db:push`
Expected: drizzle-kit 提示新增两列、两索引；确认后输出 `[✓] Changes applied`。

> 注意：`db:push` 改本地 dev DB；CI/生产环境的 schema 同步由日常 db migrate 流程处理（本仓库当前实践是 `db:push` 即可，参考 `CLAUDE.md`）。如执行环境无 PostgreSQL 可用，跳过此步并在最终验证阶段补做。

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(db): add content_hash columns for resume upload dedup"
```

---

## Task 3: S3 key 构造工具加 hash 命名变体

**Files:**

- Modify: `src/lib/s3.ts`

- [ ] **Step 1: 在 `buildAttachmentKey` 之后追加 `buildAttachmentKeyByHash`**

打开 `src/lib/s3.ts`，在第 66 行（`buildAttachmentKey` 函数末尾）之后插入：

```ts
// 基于内容哈希命名的 chat 附件 S3 key——多个 chat_attachment 行共用同一个 hash key。
// Hash-keyed S3 key for chat attachments — multiple rows can share the same key.
export async function buildAttachmentKeyByHash(hash: string, extension: string): Promise<string> {
  const { config } = await getClient();
  const safeExt = extension.replaceAll(/[^a-z0-9]/gi, "").toLowerCase() || "bin";
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  return `${prefix}chat-attachments/${hash}.${safeExt}`;
}
```

- [ ] **Step 2: 在 `buildInterviewResumeKey` 之后追加 `buildInterviewResumeKeyByHash`**

```ts
// 基于内容哈希命名的 studio 简历 S3 key——多条面试可指向同一对象。
// Hash-keyed S3 key for studio interview resumes — multiple records can point at the same object.
export async function buildInterviewResumeKeyByHash(hash: string): Promise<string> {
  const { config } = await getClient();
  const prefix = config.keyPrefix ? `${config.keyPrefix.replace(/\/+$/, "")}/` : "";
  return `${prefix}studio-resumes/${hash}.pdf`;
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/lib/s3.ts
git commit -m "feat(s3): add hash-keyed builders for chat/studio resume objects"
```

---

## Task 4: chat-attachments 查询层加 hash 查找 + contentHash 字段

**Files:**

- Modify: `src/server/queries/chat-attachments.ts`

> 这一步只动 query 层契约：返回字段、入参类型、新增按 hash 查询的方法。后续 Task 5/6 才动路由调用。

- [ ] **Step 1: 给 `ChatAttachmentRow` 与 `CreateAttachmentInput` 加 `contentHash`**

打开 `src/server/queries/chat-attachments.ts`，在 `ChatAttachmentRow` 接口末尾追加（位置在 `parsedAt` 行之后）：

```ts
contentHash: string | null;
```

在 `CreateAttachmentInput` 接口末尾追加：

```ts
contentHash?: string | null;
```

- [ ] **Step 2: `createAttachment` 写入 `contentHash`**

修改 `createAttachment` 内的 `db.insert(chatAttachment).values({...})`，在 `userId` 之前加：

```ts
contentHash: input.contentHash ?? null,
```

- [ ] **Step 3: 在文件末尾追加 `findAttachmentByContentHash`**

```ts
// 全局按内容哈希查 chat_attachment——任意一行命中即可作为 storageKey + 解析结果的复用源。
// Global lookup by content hash; any matching row is a reuse source for storageKey + parsed*.
export async function findAttachmentByContentHash(hash: string): Promise<ChatAttachmentRow | null> {
  const [row] = await db
    .select()
    .from(chatAttachment)
    .where(eq(chatAttachment.contentHash, hash))
    .limit(1);
  return (row as ChatAttachmentRow | undefined) ?? null;
}
```

确认文件顶部已经 `import { and, eq, inArray } from "drizzle-orm"`；如未导入 `eq` 单独使用，前面 `getUserAttachment` 已经在用，无需补。

- [ ] **Step 4: 类型检查**

Run: `pnpm typecheck`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add src/server/queries/chat-attachments.ts
git commit -m "feat(chat-attachments): expose contentHash + findAttachmentByContentHash"
```

---

## Task 5: 改 `POST /api/chat/uploads` 走 hash 去重

**Files:**

- Modify: `src/server/routes/chat/route.ts`

> 改造点：
>
> 1. 服务端用 `sha256HexOfBytes` 自算 hash（不读客户端字段）。
> 2. 命中既有行：复制 storageKey + 全部解析字段，跳过 S3 PUT 与解析。
> 3. 未命中：S3 key 改用 `buildAttachmentKeyByHash(hash, ext)`。
> 4. INSERT 写入 `contentHash`。

- [ ] **Step 1: 引入新工具**

文件顶部 import 区，把：

```ts
import { buildAttachmentKey, getObjectStream, putObjectBytes } from "@/lib/s3";
import { createAttachment, getUserAttachment } from "@/server/queries/chat-attachments";
```

改为：

```ts
import {
  buildAttachmentKey,
  buildAttachmentKeyByHash,
  getObjectStream,
  putObjectBytes,
} from "@/lib/s3";
import {
  createAttachment,
  findAttachmentByContentHash,
  getUserAttachment,
} from "@/server/queries/chat-attachments";
import { sha256HexOfBytes } from "@/lib/file-hash";
```

`buildAttachmentKey` 不再被 chat 路径使用，但保留 import 以方便未来 backfill 调用——若 lint 抱怨未用，可暂时给一行 `// oxlint-disable-line ...`，或者删除 import；这里**保留 import**，理由是 `mediaTypeToExtension` 仍然只服务于附件 key 构造。

> 修订：`buildAttachmentKey` 在改造完成后实际**不再被引用**。删除其 import，避免 lint 警告。最终 import 区：

```ts
import { buildAttachmentKeyByHash, getObjectStream, putObjectBytes } from "@/lib/s3";
import {
  createAttachment,
  findAttachmentByContentHash,
  getUserAttachment,
} from "@/server/queries/chat-attachments";
import { sha256HexOfBytes } from "@/lib/file-hash";
```

- [ ] **Step 2: 重写 `POST /uploads` 处理函数**

定位 `src/server/routes/chat/route.ts:164` 处的 `.post("/uploads", ...)`，把整段处理函数（约 164–249 行）替换为：

```ts
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
  const original = new Uint8Array(await file.arrayBuffer());

  // 服务端始终自算 hash，不读客户端声称值。
  // The server always computes the hash itself; client claims are ignored.
  const contentHash = await sha256HexOfBytes(original);

  // 命中既有行：复制 storageKey + 解析结果，新建一条独立 attachment 行。
  // Hash hit: reuse storageKey and parse result; insert a fresh per-user row.
  const existing = await findAttachmentByContentHash(contentHash);
  if (existing) {
    const attachmentId = crypto.randomUUID();
    await createAttachment({
      contentHash,
      filename,
      id: attachmentId,
      mediaType: file.type,
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

    return c.json({
      id: attachmentId,
      parseStatus: existing.parsedStatus,
      ...(existing.parsedStatus === "ready" && {
        parsed: {
          pageCount: existing.parsedPageCount,
          structured: existing.parsedStructured,
          text: existing.parsedText,
          textSource: existing.parsedTextSource,
        },
      }),
      url: `/api/chat/attachments/${attachmentId}`,
    });
  }

  // 未命中：走原有上传 + 解析路径，但 S3 key 用 hash 命名。
  // Miss: original upload + parse path, but S3 key is derived from the hash.
  const attachmentId = crypto.randomUUID();
  const storageKey = await buildAttachmentKeyByHash(
    contentHash,
    mediaTypeToExtension(file.type),
  );

  // pdf-parse / pdfjs may transfer the underlying ArrayBuffer to a worker,
  // detaching the original. Hand out independent copies so the S3 upload
  // and the parse pipeline cannot poison each other.
  const bytesForUpload = new Uint8Array(original);
  const bytesForParse = new Uint8Array(original);

  const [uploadOutcome, parseOutcome] = await Promise.allSettled([
    putObjectBytes({ body: bytesForUpload, contentType: file.type, storageKey }),
    parseResumeFast(bytesForParse),
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
          parsedStructured: parseOutcome.value.structured,
          parsedText: parseOutcome.value.text,
          parsedTextSource: parseOutcome.value.textSource,
        }
      : {
          parsedAt: new Date(),
          parsedError: String(parseOutcome.reason).slice(0, 500),
          parsedStatus: "failed" as const,
        };

  if (parseOutcome.status === "rejected") {
    console.error("[chat] resume preparse failed (non-fatal)", parseOutcome.reason);
  }

  await createAttachment({
    contentHash,
    filename,
    id: attachmentId,
    mediaType: file.type,
    size: file.size,
    storageKey,
    userId: user.id,
    ...parseFields,
  });

  return c.json({
    id: attachmentId,
    parseStatus: parseFields.parsedStatus,
    ...(parseOutcome.status === "fulfilled" && {
      parsed: {
        pageCount: parseOutcome.value.pageCount,
        structured: parseOutcome.value.structured,
        text: parseOutcome.value.text,
        textSource: parseOutcome.value.textSource,
      },
    }),
    url: `/api/chat/attachments/${attachmentId}`,
  });
})
```

- [ ] **Step 3: 类型检查 + lint**

Run: `pnpm typecheck && pnpm check`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/chat/route.ts
git commit -m "feat(chat): dedup chat uploads by content hash on POST /uploads"
```

---

## Task 6: 新增 `POST /api/chat/uploads/preflight` 端点

**Files:**

- Modify: `src/server/routes/chat/route.ts`
- Modify: `src/server/routes/chat/schema.ts`

- [ ] **Step 1: 在 schema 文件加 preflight zod schema**

打开 `src/server/routes/chat/schema.ts`，在文件末尾追加：

```ts
const HASH_RE = /^[0-9a-f]{64}$/;

export const uploadPreflightSchema = z.object({
  filename: z.string().min(1).max(255),
  hash: z.string().regex(HASH_RE, "Invalid sha256 hex"),
  mediaType: z.literal("application/pdf"),
  size: z.number().int().positive().max(MAX_ATTACHMENT_SIZE),
});
```

- [ ] **Step 2: 在 chat 路由 chain 上挂 preflight 处理器**

打开 `src/server/routes/chat/route.ts`。在 import 区追加：

```ts
import { uploadPreflightSchema } from "./schema";
```

在 `.post("/uploads", ...)` 之前插入新的 `.post("/uploads/preflight", ...)`：

```ts
.post(
  "/uploads/preflight",
  zValidator("json", uploadPreflightSchema),
  async (c) => {
    const { user } = c.var;
    if (!user) {
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
      id: attachmentId,
      parseStatus: existing.parsedStatus,
      ...(existing.parsedStatus === "ready" && {
        parsed: {
          pageCount: existing.parsedPageCount,
          structured: existing.parsedStructured,
          text: existing.parsedText,
          textSource: existing.parsedTextSource,
        },
      }),
      url: `/api/chat/attachments/${attachmentId}`,
    });
  },
)
```

- [ ] **Step 3: 类型检查 + lint**

Run: `pnpm typecheck && pnpm check`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/chat/route.ts src/server/routes/chat/schema.ts
git commit -m "feat(chat): add POST /uploads/preflight for hash-based dedup"
```

---

## Task 7: 客户端 `uploadAttachment` 接 preflight

**Files:**

- Modify: `src/lib/api/endpoints/chat.ts`

> 思路：保持公开签名 `uploadAttachment(blob, filename)` 不变，**内部**先尝试 preflight，命中则直接返回；未命中再走原 multipart 上传。这样 `prompt-input.tsx` 等调用点零改动。

- [ ] **Step 1: 在 chat.ts 顶部 import 新增同构 hash 工具**

```ts
import { sha256HexOfFile } from "@/lib/file-hash";
```

- [ ] **Step 2: 加 preflight 响应类型与 helper**

在 `UploadedAttachment` 接口下方追加：

```ts
type UploadPreflightResponse = { hit: false } | (UploadedAttachment & { hit: true });

async function tryUploadPreflight(file: File): Promise<UploadedAttachment | null> {
  if (file.type !== "application/pdf") {
    return null;
  }
  let hash: string;
  try {
    hash = await sha256HexOfFile(file);
  } catch {
    return null;
  }
  try {
    const result = await apiFetch<UploadPreflightResponse>("/api/chat/uploads/preflight", {
      body: {
        filename: file.name || "attachment.pdf",
        hash,
        mediaType: file.type,
        size: file.size,
      },
      method: "POST",
    });
    if (!result.hit) {
      return null;
    }
    const { hit: _hit, ...rest } = result;
    return rest;
  } catch {
    // preflight 任何失败都安静降级到 multipart 路径——保持上传可用性。
    // Any preflight failure silently degrades to the multipart path.
    return null;
  }
}
```

- [ ] **Step 3: 让 `uploadAttachment` 先试 preflight**

把现有 `uploadAttachment` 函数（约 156–168 行）替换为：

```ts
export async function uploadAttachment(blob: Blob, filename: string): Promise<UploadedAttachment> {
  const file =
    blob instanceof File
      ? blob
      : new File([blob], filename, { type: blob.type || "application/pdf" });

  const hit = await tryUploadPreflight(file);
  if (hit) {
    return hit;
  }

  const form = new FormData();
  form.append("file", file, filename);

  return apiFetch<UploadedAttachment>("/api/chat/uploads", {
    body: form,
    method: "POST",
  });
}
```

- [ ] **Step 4: 类型检查 + lint**

Run: `pnpm typecheck && pnpm check`
Expected: 通过。

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/endpoints/chat.ts
git commit -m "feat(chat-api): preflight resume uploads to skip duplicate bytes"
```

---

## Task 8: `storeInterviewResume` 内部去重 + 返回 contentHash

**Files:**

- Modify: `src/server/routes/interview/utils.ts`

- [ ] **Step 1: 修改 import**

打开 `src/server/routes/interview/utils.ts`，把：

```ts
import { buildInterviewResumeKey, putObjectBytes } from "@/lib/s3";
```

改为：

```ts
import { eq, inArray, isNotNull, and } from "drizzle-orm";
import { buildInterviewResumeKey, buildInterviewResumeKeyByHash, putObjectBytes } from "@/lib/s3";
import { sha256HexOfBytes } from "@/lib/file-hash";
```

> 注意：文件顶部已经从 `drizzle-orm` 引入 `eq, inArray`（第 2 行）；这里只是补充 `isNotNull, and` 到同一 import 行。如果原有 import 行只有 `eq, inArray`，就把它整行改成上面的组合形式。

`buildInterviewResumeKey` 保留 import——目前 utils 文件里它是孤立函数，不再被本 utils 调用，但其它模块可能引用；确认是否仍被使用：`grep -n "buildInterviewResumeKey\b" src` —— 若仅本文件引用且本任务后不再用，删除 import 与函数本体。否则保留。

> 修订：经搜索，`buildInterviewResumeKey` 当前**仅**在 `storeInterviewResume` 内被使用。本任务改造后不再调用——但函数本身留在 `s3.ts` 不删（备用）。本文件 import 中删去 `buildInterviewResumeKey`。最终 import 行：

```ts
import { eq, isNotNull, and } from "drizzle-orm";
import { buildInterviewResumeKeyByHash, putObjectBytes } from "@/lib/s3";
import { sha256HexOfBytes } from "@/lib/file-hash";
```

> 同时检查文件顶部既有 `import { eq, inArray } from "drizzle-orm";`（第 2 行）：合并为 `import { and, eq, inArray, isNotNull } from "drizzle-orm";`。

- [ ] **Step 2: 改写 `storeInterviewResume` 函数**

把 `src/server/routes/interview/utils.ts:145` 处的整个函数替换为：

```ts
/**
 * 把简历 PDF 写入 S3 并返回 storageKey + contentHash。
 * 同 hash 已存在 (任意一条 studio_interview 行) 时复用既有 storageKey，跳过 PUT。
 *
 * Upload the candidate resume PDF to S3 and return both storageKey and contentHash.
 * If a studio_interview row with the same hash exists, the existing storageKey is
 * reused and no PUT is performed.
 *
 * Silently returns null when S3 isn't configured — the interview record still
 * persists, preview just won't be available for this row.
 */
export async function storeInterviewResume(
  _interviewRecordId: string,
  file: File,
): Promise<{ storageKey: string; contentHash: string } | null> {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentHash = await sha256HexOfBytes(bytes);

    const [existing] = await db
      .select({ storageKey: studioInterview.resumeStorageKey })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.resumeContentHash, contentHash),
          isNotNull(studioInterview.resumeStorageKey),
        ),
      )
      .limit(1);

    if (existing?.storageKey) {
      return { contentHash, storageKey: existing.storageKey };
    }

    const storageKey = await buildInterviewResumeKeyByHash(contentHash);
    await putObjectBytes({
      body: bytes,
      contentType: file.type || "application/pdf",
      storageKey,
    });
    return { contentHash, storageKey };
  } catch (error) {
    console.error("[studio-interview] failed to upload resume to S3:", error);
    return null;
  }
}
```

> `_interviewRecordId` 形参保留是为了不破坏调用方签名——但参数本身已不再使用，前缀下划线告诉 lint 是有意未用。

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 通过。**调用点 `interview/route.ts` 会因为返回类型从 `string | null` 变成对象 `| null` 而报错**——下一个 Task 修。

- [ ] **Step 4: Commit（暂不修调用点，先把 utils 单独提交）**

```bash
git add src/server/routes/interview/utils.ts
git commit -m "refactor(studio-interview): dedup resume upload by content hash"
```

> 注意：此 commit 后 typecheck 暂时不通过；下一 Task 立即修复。中间 commit 形态合理（小步推进），但**不要在此处 push 远端**直到 Task 9 完成。

---

## Task 9: 修 interview 路由调用点写入 resumeContentHash

**Files:**

- Modify: `src/server/routes/interview/route.ts`

`storeInterviewResume` 现有 2 个调用点（route.ts:670 创建 & route.ts:969 编辑）。每处都要把返回值解构成 `{ storageKey, contentHash }` 并写入 record。

- [ ] **Step 1: 修复 POST `/api/studio/interviews` 创建路径**

定位 route.ts:669–671（创建分支）：

```ts
const resumeStorageKey = resume ? await storeInterviewResume(interviewRecordId, resume) : null;
```

替换为：

```ts
const uploadResult = resume ? await storeInterviewResume(interviewRecordId, resume) : null;
const resumeStorageKey = uploadResult?.storageKey ?? null;
const resumeContentHash = uploadResult?.contentHash ?? null;
```

向下定位 `record = { ... }` 对象字面量（约 672–687 行），在 `resumeStorageKey,` 之后追加一行：

```ts
resumeContentHash,
```

`record satisfies typeof studioInterview.$inferInsert` 自动接受新字段（drizzle 已经因 schema 加列推断出来）。

- [ ] **Step 2: 修复 PATCH/PUT 编辑路径**

定位 route.ts:968–970：

```ts
const resumeStorageKey = resume
  ? ((await storeInterviewResume(id, resume)) ?? existing.resumeStorageKey)
  : existing.resumeStorageKey;
```

替换为：

```ts
const uploadResult = resume ? await storeInterviewResume(id, resume) : null;
const resumeStorageKey = uploadResult?.storageKey ?? existing.resumeStorageKey;
const resumeContentHash = resume
  ? (uploadResult?.contentHash ?? existing.resumeContentHash)
  : existing.resumeContentHash;
```

向下找到该处 update 写回数据库的对象字面量（紧随同函数内的 `await db.update(studioInterview).set({ ... })`），在 `resumeStorageKey,` 之后追加：

```ts
resumeContentHash,
```

> 若该函数还没有显式写 `resumeStorageKey` 字段，看上下文：编辑路径会把整个 record 对象传给 update。沿用同一变量名替换/追加即可。如果有疑问，先 `git grep -n "resumeStorageKey" src/server/routes/interview/route.ts` 找全部命中点确认。

- [ ] **Step 3: 类型检查 + lint**

Run: `pnpm typecheck && pnpm check`
Expected: 通过。

- [ ] **Step 4: Commit**

```bash
git add src/server/routes/interview/route.ts
git commit -m "feat(studio-interview): persist resumeContentHash on create/edit"
```

---

## Task 10: 服务端集成测试 —— preflight + upload 命中分支

**Files:**

- Create: `src/server/routes/chat/__tests__/upload-dedup.test.ts`

> 范围：直接调用 query 层（`createAttachment` + `findAttachmentByContentHash`）验证"二次 INSERT 用相同 hash 时能查到"，以及 preflight handler 内部的复制逻辑。S3 / 真实 HTTP 走 mock，避免依赖运行时环境。

- [ ] **Step 1: 写失败的测试**

```ts
// src/server/routes/chat/__tests__/upload-dedup.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => {
  const rows: Record<string, unknown>[] = [];
  return {
    db: {
      __rows: rows,
      insert: () => ({
        values: async (record: Record<string, unknown>) => {
          rows.push(record);
        },
      }),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => rows.slice(0, 1),
          }),
        }),
      }),
    },
  };
});

import { createAttachment, findAttachmentByContentHash } from "@/server/queries/chat-attachments";

describe("chat attachment dedup query layer", () => {
  beforeEach(async () => {
    const { db } = (await import("@/lib/db")) as unknown as { db: { __rows: unknown[] } };
    db.__rows.length = 0;
  });

  it("createAttachment persists contentHash", async () => {
    await createAttachment({
      contentHash: "a".repeat(64),
      filename: "r.pdf",
      id: "att-1",
      mediaType: "application/pdf",
      parsedStatus: "ready",
      parsedText: "hello",
      size: 1234,
      storageKey: "chat-attachments/aaaa.pdf",
      userId: "user-1",
    });

    const { db } = (await import("@/lib/db")) as unknown as {
      db: { __rows: { contentHash: string }[] };
    };
    expect(db.__rows[0]?.contentHash).toBe("a".repeat(64));
  });

  it("findAttachmentByContentHash returns the latest stub row", async () => {
    await createAttachment({
      contentHash: "b".repeat(64),
      filename: "r.pdf",
      id: "att-2",
      mediaType: "application/pdf",
      parsedStatus: "ready",
      size: 100,
      storageKey: "chat-attachments/bbbb.pdf",
      userId: "user-2",
    });
    const found = await findAttachmentByContentHash("b".repeat(64));
    expect(found?.storageKey).toBe("chat-attachments/bbbb.pdf");
  });
});
```

- [ ] **Step 2: 跑测试确认失败（如 query 层尚未导出 `findAttachmentByContentHash` 会报错）**

Run: `pnpm test src/server/routes/chat/__tests__/upload-dedup.test.ts`
Expected: PASS（如果 Task 4 已完成）。如失败：根据错误回到 Task 4 检查导出名 / 字段名。

> 若 db mock 的 `where().limit()` 链路与 drizzle 真实 builder 链不一致，根据报错调整 mock 的链路返回值。drizzle 的 select chain 实际形式：`db.select().from(table).where(cond).limit(n)` —— `limit(n)` 直接返回 `Promise<rows[]>`。上面 mock 用同步 array 模拟即可。

- [ ] **Step 3: Commit**

```bash
git add src/server/routes/chat/__tests__/upload-dedup.test.ts
git commit -m "test(chat-uploads): cover contentHash persistence and lookup"
```

---

## Task 11: 全量验证

- [ ] **Step 1: typecheck**

Run: `pnpm typecheck`
Expected: PASS。

- [ ] **Step 2: lint**

Run: `pnpm check`
Expected: PASS。

- [ ] **Step 3: vitest**

Run: `pnpm test`
Expected: 所有用例通过，至少包含本计划新增的 `file-hash.test.ts` 与 `upload-dedup.test.ts`。

- [ ] **Step 4: 手工冒烟**

启动 dev server：

```bash
pnpm dev
```

在浏览器：

1. 登录后打开 chat composer，拖入一份新简历 PDF。期望：上传成功，预览正常。
2. 重新拖入完全相同的 PDF（或在另一会话/另一个用户帐号）。打开 DevTools Network 面板：
   - 期望看到 `POST /api/chat/uploads/preflight` 命中（响应 `hit: true` + `id`），**不再发出** `POST /api/chat/uploads`。
   - UI 上附件状态秒变 `uploaded`，解析字段直接回填。
3. 进入 studio interview 创建页，上传同一份简历。后端日志应观察到 hash 命中、`putObjectBytes` 不触发；DB 中 `studio_interview.resume_content_hash` 写入。
4. 编辑既有面试，替换简历为另一份**新**文件。期望：新 hash 未命中分支正常 PUT 到 `studio-resumes/{newHash}.pdf`。

- [ ] **Step 5: 终态 commit**（如有累积修改）

如果 Task 1–10 的 commit 已经合理拆分，本步只需检查 `git status` 干净。否则把 verification 阶段顺手做的微调单独提交：

```bash
git status
git diff
# 如有 → 单独 commit
```

---

## Self-Review Notes

- **Spec 覆盖**：Schema (T2)、客户端 hash (T1+T7)、preflight 端点 (T6)、`POST /uploads` 改造 (T5)、studio_interview 改造 (T8+T9)、读路径不变（隐式，仅校验未触动 GET 处理）、测试 (T1+T10)、验证 (T11)。✓
- **不动老数据**：`contentHash` 默认 NULL；老行 storageKey 保持原 uuid 命名；改造仅在新写入路径生效。✓
- **跨表去重未实现**：与 spec 决策一致。
- **注意点**：
  - Task 8 commit 后短暂存在 typecheck 失败状态——务必 Task 9 紧接着完成。
  - `buildAttachmentKey(uuid, ext)` / `buildInterviewResumeKey(interviewRecordId)` 不删，留作未来 backfill 备用。
  - 客户端 preflight 失败一律静默降级到 multipart 上传——任何 hash/网络异常都不会阻塞主流程。
