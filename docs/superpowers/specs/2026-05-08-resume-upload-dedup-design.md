# 简历上传基于内容哈希的去重

**日期**: 2026-05-08
**作者**: @allen + Claude
**状态**: Draft

## 背景

当前简历上传有两个入口，每次上传都会无条件生成新的 S3 对象 + 新的数据库行：

- **Chat 路径** `POST /api/chat/uploads`（`src/server/routes/chat/route.ts:164`）：用 UUID 生成 storageKey `chat-attachments/{uuid}.pdf`，PUT 到 S3，并行运行 pdf-parse / Qwen OCR 解析流水线，写一行 `chat_attachment`。
- **Studio interview 路径** `storeInterviewResume`（`src/server/routes/interview/utils.ts:145`）：以 `studio-resumes/{interviewRecordId}.pdf` 为 key 直接 PUT 到 S3。

由此带来：

1. 同一份 PDF 被同一用户多次上传、被不同用户分别上传，都会在 S3 留下相同字节的多个对象，浪费存储。
2. Chat 路径的解析流水线每次都重跑，重复消耗 OCR 配额（参见 `2026-05-07-pdf-preparse-design.md`，解析已经放到上传期，但解析结果仍按上传次数复制）。

## 目标

1. **同一文件二次上传秒返回**：客户端在调用上传接口前用 SHA-256 探测，若服务端已有相同字节的简历就直接复用 S3 对象 + 解析结果。
2. **去重作用范围全局**：跨用户共享 S3 对象与解析结果，不按用户隔离。
3. 同时覆盖 chat 和 studio_interview 两条上传链路，但**不跨表去重**——chat_attachment 自查自己，studio_interview 自查自己。
4. **不动老数据**：仅对新上传生效，存量行保留旧 storageKey 与 NULL contentHash。

## 非目标

- 老数据回填 / 一次性 backfill 脚本。
- 引用计数 / 自动 GC（删行时不删 S3 对象，目前本来如此）。
- 跨表去重（chat 与 studio_interview 互查）。
- 断点续传 / 分块 hash（简历 PDF 通常 < 5MB，整体 hash 在浏览器内 < 500ms）。
- preflight 接口的 rate limit / hash 探测拒绝（SHA-256 不可暴力猜测，威胁不实际）。

## 架构总览

不引入新表。给两张已有表各加一列：

```
chat_attachment                          studio_interview
  - id (PK)                                - id (PK)
  - userId, filename, createdAt …          - resumeFileName, resumeStorageKey …
  - storageKey                             - resumeContentHash         ← 新增
  - parsedText / parsedStructured …
  - contentHash                ← 新增

  index: (content_hash)                    index: (resume_content_hash)
```

不同行允许有相同 contentHash——多行共享同一份 storageKey，每行仍独立属于自己的用户/面试。解析结果 (`parsedText` / `parsedStructured` / `parsedPageCount` / `parsedTextSource`) 在命中时**物理复制**到新行，不是引用——简单、读路径无变化、查询无 JOIN。

S3 命名：新上传的 storageKey 改用 hash 命名：

- chat: `chat-attachments/{hash}.pdf`
- studio: `studio-resumes/{hash}.pdf`

老行的 storageKey（含 uuid 的旧 key、含 interviewRecordId 的旧 key）原样保留，读路径用什么字段就读什么字段，无差别。

## 关键 trade-off / 决策记录

- **解析结果按行物理复制 vs 抽出共享 blob 表**：选物理复制。简历 JSON 通常几十 KB，量级可控；省下来 S3 对象 + OCR 调用是真金白银，DB 里的 JSON 复制无关紧要。新表会带来 JOIN、迁移、引用计数等额外复杂度，不值。
- **跨表去重**：v1 不做。chat 上传过的简历再走 studio 入口仍然会重新 PUT。如未来需要跨表，把 preflight / 服务端二次查询改成 `chat_attachment UNION studio_interview` 即可，不需要 schema 变化。
- **客户端伪造 hash 风险**：preflight 命中后服务端**只**给当前用户新建一行 attachment，把 storageKey + 解析结果复制过去。读路径仍按 `userId + id` 鉴权，因此攻击者拿到的 attachmentId 只能让他读"自己声称持有"的那个 hash。SHA-256 不可猜测——拿到正确 hash 等价于已经持有文件，不构成新增信息泄漏。
- **服务端二次哈希**：实际上传路径（未命中分支）服务端**重新计算一次** SHA-256，不信任客户端。这层防御对应"客户端声称 hash A、实际字节为 B"的场景。
- **canonical key 写冲突**：两个用户同时未命中并发 PUT 同一个 `chat-attachments/{hash}.pdf`——S3 PUT 是幂等覆盖（同字节同 ETag），DB INSERT 写入各自独立 attachmentId，不冲突。

## Schema 变更

`src/lib/db/schema.ts`：

```ts
// chat_attachment 新增列与索引
contentHash: text("content_hash"),
// → 表定义末尾追加
index("chat_attachment_content_hash_idx").on(table.contentHash),

// studio_interview 新增列与索引
resumeContentHash: text("resume_content_hash"),
// → 表定义末尾追加
index("studio_interview_resume_hash_idx").on(table.resumeContentHash),
```

约束：

- **不**设 UNIQUE：同 hash 多行合法。
- **不**设 NOT NULL：老行保持 NULL，新行总是写值。
- 普通 btree 索引足够。

迁移命令：`npm run db:push`（依据 `CLAUDE.md` 中的 Drizzle 工作流）。

## 客户端流程

新增 `src/lib/file-hash.ts`：

```ts
export async function sha256Hex(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
```

修改 `src/components/resume-import-button.tsx` 的提交流程：

```
1. const hash = await sha256Hex(file)
2. const pre = await fetch("/api/chat/uploads/preflight", {
     method: "POST",
     body: JSON.stringify({ hash, size: file.size, mediaType: file.type, filename: file.name }),
   }).then((r) => r.json())
3. if (pre.hit) {
     // 直接拿到新 attachmentId 与解析结果，组装 FileUIPart 即可
     return { id: pre.id, parsed: pre.parsed, ... }
   }
4. // 未命中：走原有 multipart 上传
   const fd = new FormData();
   fd.set("file", file);
   await fetch("/api/chat/uploads", { method: "POST", body: fd });
```

studio_interview 入口（resume 表单）的客户端是 multipart 表单提交，**不接 preflight**——继续走 `POST` 表单，去重在服务端 `storeInterviewResume` 内部完成。客户端无改动。这个差异是有意的：studio 表单不像 chat composer 那样会同时挂多个文件，且作为后台管理入口对 UX 敏感度低，省去客户端散弹改动。

## 服务端流程

### 新增 `POST /api/chat/uploads/preflight`

挂在 `src/server/routes/chat/route.ts` 同一 chain 上。

```
input: { hash: string(64 hex), size: number, mediaType: "application/pdf", filename: string }
auth: 必须登录

1. 校验 hash 格式 / size 不超过 MAX_ATTACHMENT_SIZE / mediaType
2. row = SELECT * FROM chat_attachment WHERE content_hash = hash LIMIT 1
3. if (!row) return { hit: false }
4. newId = crypto.randomUUID()
   INSERT chat_attachment {
     id: newId,
     userId: 当前用户.id,
     filename: 入参 filename,           // 用户自己的命名
     mediaType, size,                   // 用户自己提交的元数据
     storageKey: row.storageKey,        // 共享 S3 对象
     contentHash: hash,
     // 解析结果整体复制
     parsedAt: row.parsedAt,
     parsedStatus: row.parsedStatus,
     parsedText: row.parsedText,
     parsedStructured: row.parsedStructured,
     parsedPageCount: row.parsedPageCount,
     parsedTextSource: row.parsedTextSource,
     parsedError: row.parsedError,
   }
5. return {
     hit: true,
     id: newId,
     parseStatus: row.parsedStatus,
     parsed: row.parsedStatus === "ready" ? {
       text: row.parsedText,
       structured: row.parsedStructured,
       pageCount: row.parsedPageCount,
       textSource: row.parsedTextSource,
     } : undefined,
     url: `/api/chat/attachments/${newId}`,
   }
```

返回结构与 `POST /api/chat/uploads` 命中分支保持一致，让客户端可以无差别消费。

### 改 `POST /api/chat/uploads`

`src/server/routes/chat/route.ts:164` 现有逻辑：

```
file → buildAttachmentKey(uuid, ext) → 并行(putObjectBytes, parseResumeFast) → createAttachment
```

改为：

```
1. file 取 bytes
2. hash = sha256(bytes)            // 服务端始终自算，不接受客户端提交
3. row = SELECT * FROM chat_attachment WHERE content_hash = hash LIMIT 1
4. if (row) {
     // 与 preflight 命中分支同一逻辑：复制 storageKey + 解析结果，INSERT 新行，不 PUT 不 parse
     newId = uuid; INSERT …; return { id: newId, parseStatus: row.parsedStatus, parsed?, url }
   }
5. else {
     storageKey = `chat-attachments/${hash}.pdf`
     并行 (putObjectBytes(bytesForUpload, storageKey), parseResumeFast(bytesForParse))
     createAttachment({ ..., storageKey, contentHash: hash, parsed* })
     return 原响应 shape
   }
```

`buildAttachmentKey(uuid, ext)` 不删（老 attachment 的 storageKey 是用它生成的，未来若做 backfill 仍要参考）。新增 `buildAttachmentKeyByHash(hash, ext)` 命名更清晰，被未命中分支使用。

### 改 `storeInterviewResume`

`src/server/routes/interview/utils.ts:145`：

```
1. bytes = file.arrayBuffer()
2. hash = sha256(bytes)
3. row = SELECT resumeStorageKey FROM studio_interview
        WHERE resume_content_hash = hash AND resumeStorageKey IS NOT NULL LIMIT 1
4. if (row) return { storageKey: row.resumeStorageKey, contentHash: hash }
5. else {
     storageKey = buildInterviewResumeKeyByHash(hash)   // → studio-resumes/{hash}.pdf
     putObjectBytes({ body: bytes, contentType, storageKey })
     return { storageKey, contentHash: hash }
   }
```

调用方（`src/server/routes/interview/route.ts` 中创建/编辑面试的处理器）拿到 `{ storageKey, contentHash }` 后一并写入 `studio_interview` 行的 `resumeStorageKey` + `resumeContentHash`。

旧函数签名返回 `string | null`（仅 storageKey）需要扩展为返回结构 `{ storageKey, contentHash } | null`，所有调用点同步调整。

`src/lib/s3.ts` 增加 `buildInterviewResumeKeyByHash(hash)`，与现有 `buildInterviewResumeKey(interviewRecordId)` 并存。

## 读路径

不变。

`GET /api/chat/attachments/:id`（`src/server/routes/chat/route.ts:250`）继续用 `userId + id` 鉴权拉行、再用 `row.storageKey` 流式读 S3 对象。共享 S3 对象对读取完全透明。

studio_interview 的简历预览路径同理——只关心行上的 storageKey，对 hash 的存在与否无感。

## 错误处理

- preflight 命中后 INSERT 失败：返回 500，客户端自然回退到 multipart 上传分支。
- 未命中分支并发 PUT 同一 canonical key：S3 幂等覆盖，无影响。
- 未命中分支 INSERT 命中 PK 冲突（attachmentId UUID 碰撞，理论 0 概率）：直接 500，让客户端重试。
- 客户端 preflight 声称的 hash 与实际文件不符：preflight 只用于"探测"，未命中分支走真实 multipart 上传时服务端会重新自算 hash，因此不存在"以客户端 hash 为准"的攻击面。

## 测试

- `sha256Hex` 单测：固定字节 → 固定 hex。
- preflight：未命中分支返回 `{ hit: false }`；命中分支返回新 id + 复制后的 row 数据。
- `POST /api/chat/uploads` 集成测试：
  - 第一次上传：写 row、PUT S3。
  - 同一 hash 第二次（不同用户）：不 PUT、不 parse、复用 storageKey、复制解析字段。
- `storeInterviewResume`：相同 hash 二次调用不重复 PUT，返回首个 storageKey。

## 实施顺序（高层）

1. Schema 加列 + 索引 + push。
2. `src/lib/file-hash.ts` + 服务端等价工具。
3. `src/lib/s3.ts` 加 `buildAttachmentKeyByHash` / `buildInterviewResumeKeyByHash`。
4. 改 `POST /api/chat/uploads` 走 hash 路径。
5. 加 `POST /api/chat/uploads/preflight`。
6. 改 `src/components/resume-import-button.tsx` 客户端调 preflight。
7. 改 `storeInterviewResume` + 所有调用点写入 `resumeContentHash`。
8. 加测试。
9. `pnpm typecheck` + `pnpm lint` + 相关测试通过。

详细任务拆解放到对应的 implementation plan。
