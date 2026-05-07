# PDF 简历上传期解析 + Qwen OCR 流水线

**日期**: 2026-05-07
**作者**: @sakurawen + Claude
**状态**: Draft

## 背景

现状下用户上传 PDF 简历后，PDF 以 data-url / S3-url 形式驻留在 message 的 `FileUIPart` 中，**不会预先解析**。每次模型调用时通过 `parse_resume` / `extract_resume_pdf_text` 工具按需解析：

1. `extract_pdf_text` 工具（pdf-parse 0.5–2s）
2. 子 agent 凭 LLM 判断文本质量是否合格（一次 LLM RTT 1–2s）
3. 不合格则 `analyze_resume_with_vision` 走 Gemini 2.5 Flash 视觉抽取（2–5s）
4. 子 agent 输出结构化 JSON（一次 LLM RTT 2–3s）

**痛点**:

- 解析在 LLM 关键路径上，每次新会话都得重跑（仅 10 分钟内存缓存，多实例不共享）
- 子 agent 工具循环吃掉 2–3 次 LLM RTT
- 视觉兜底依赖 Gemini，与项目主用的阿里 Qwen 模型生态不一致

## 目标

1. 上传期同步完成解析，**移出 LLM 关键路径**
2. 解析结果 **持久化在 `chat_attachment` 行**，跨会话/多实例复用
3. 砍掉子 agent 工具循环，**节省 2 次 LLM RTT**
4. 视觉兜底替换为 **`qwen-vl-ocr`**，与 Qwen 主链路统一
5. 前端 `UIMessage` 结构不变，预览/入库/历史完全兼容

## 非目标

- 客户端浏览器内解析（仍服务端解析）
- 多用户共享解析缓存（按用户隔离即可，与 `chat_attachment.userId` 一致）
- 增量/流式 OCR（一次性返回）

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│ POST /api/chat/uploads                                      │
│   ├─ S3 upload      ─┐                                      │
│   └─ parseResumeFast ┴─→ persist chat_attachment            │
│   返回 {id, url, parseStatus: 'ready'|'failed'}             │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│ runResumeScreening(messages)                                │
│   parseUploadedResume(file)                                 │
│     ├─ 读 chat_attachment.parsedText / parsedStructured     │
│     │  命中 → 直接返回（0 LLM 调用）                          │
│     └─ 未命中 → fallback parseResumeFast(bytes)             │
└─────────────────────────────────────────────────────────────┘
```

## 详细设计

### 1. `parseResumeFast` 流水线

新文件 `src/lib/resume-parse-pipeline.ts`：

```ts
export interface ParsedResumeFast {
  text: string;
  structured: ResumeParserStructured; // 复用 resume-parser-agent.structuredSchema
  pageCount: number;
  textSource: "pdf-parse" | "qwen-ocr";
}

export async function parseResumeFast(bytes: Uint8Array): Promise<ParsedResumeFast> {
  // Stage 1: pdf-parse（始终跑，便宜）
  const { text: rawText, pageCount } = await extractPdfTextWithMeta(bytes);

  let text = rawText;
  let textSource: "pdf-parse" | "qwen-ocr" = "pdf-parse";

  // Stage 2: 启发式质量判断（无 LLM）
  if (isLowQualityResumeText(rawText)) {
    const pages = await rasterizePdf(bytes, { dpi: 150, maxPages: 6 });
    const ocrTexts = await Promise.all(pages.map(qwenVlOcr));
    text = ocrTexts.join("\n\n");
    textSource = "qwen-ocr";
  }

  // Stage 3: 一次性 generateObject 结构化
  const structured = await generateResumeStructured(text);

  return { text, structured, pageCount, textSource };
}
```

#### 启发式判断

```ts
function isLowQualityResumeText(text: string): boolean {
  if (text.trim().length < 200) return true;
  const meaningful = text.match(/[一-龥A-Za-z0-9@.,\s]/g)?.length ?? 0;
  if (meaningful / text.length < 0.6) return true;
  if (!/(教育|经历|技能|项目|实习|education|experience|skills)/i.test(text)) return true;
  return false;
}
```

判断错误的兜底：`generateResumeStructured` 返回的对象若关键字段（name/skills/experiences）几乎全空，触发一次 OCR 重试（≤1 次，避免循环）。

### 2. PDF 栅格化

新文件 `src/lib/pdf-rasterize.ts`：

```ts
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";

export async function rasterizePdf(
  bytes: Uint8Array,
  { dpi = 150, maxPages = 6 } = {},
): Promise<Buffer[]> {
  const doc = await pdfjsLib.getDocument({ data: bytes, disableWorker: true }).promise;
  const total = Math.min(doc.numPages, maxPages);
  const scale = dpi / 72;

  const pages = await Promise.all(
    Array.from({ length: total }, async (_, i) => {
      const page = await doc.getPage(i + 1);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(viewport.width, viewport.height);
      await page.render({ canvasContext: canvas.getContext("2d") as never, viewport }).promise;
      return canvas.toBuffer("image/png");
    }),
  );

  await doc.cleanup();
  return pages;
}
```

`disableWorker: true` 避免 serverless 中 worker 加载问题；`@napi-rs/canvas` 提供 DOMMatrix/ImageData/Path2D（项目已用作 pdf-parse polyfill）。

### 3. Qwen OCR 客户端

新文件 `src/lib/qwen-ocr.ts`：

```ts
import OpenAI from "openai";

const OCR_PROMPT =
  "请完整提取这张简历图片中的所有文字，包括所有图片、图表、表格中的文字。保持原始排版顺序，表格用文字形式还原。只输出提取的文字，不要解释。";

let cachedClient: OpenAI | null = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.ALIBABA_API_KEY;
  if (!apiKey) throw new Error("ALIBABA_API_KEY not configured");
  cachedClient = new OpenAI({
    apiKey,
    baseURL: process.env.QWEN_OCR_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
  });
  return cachedClient;
}

export async function qwenVlOcr(pngBytes: Buffer): Promise<string> {
  const client = getClient();
  const base64 = pngBytes.toString("base64");
  const response = await client.chat.completions.create({
    model: process.env.QWEN_OCR_MODEL ?? "qwen-vl-ocr-latest",
    max_tokens: 4096,
    temperature: 0,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:image/png;base64,${base64}` } },
          { type: "text", text: OCR_PROMPT },
        ],
      },
    ],
  });
  return response.choices[0]?.message?.content ?? "";
}
```

### 4. 结构化提取

复用 `structuredSchema` from `src/server/agents/resume-parser-agent.ts`，新函数：

```ts
export async function generateResumeStructured(text: string): Promise<ResumeParserStructured> {
  const clipped = clipResumeText(text, 16_000).text;
  const { object } = await generateObject({
    model: gateway(process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max"),
    schema: structuredSchema,
    temperature: 0,
    prompt: `${PARSER_INSTRUCTIONS_FOR_DIRECT}\n\n简历文本：\n${clipped}`,
  });
  return object;
}
```

`PARSER_INSTRUCTIONS_FOR_DIRECT` 是从现有 `PARSER_INSTRUCTIONS` 抽出的纯结构化指令（删去"先调 extract_pdf_text"那段流程描述）。

### 5. DB schema 扩展

`src/lib/db/schema.ts` `chatAttachment` 加字段：

```ts
parsedStatus: text("parsed_status")
  .$type<"pending" | "ready" | "failed">()
  .default("pending")
  .notNull(),
parsedText: text("parsed_text"),
parsedStructured: jsonb("parsed_structured").$type<ResumeParserStructured>(),
parsedPageCount: integer("parsed_page_count"),
parsedTextSource: text("parsed_text_source").$type<"pdf-parse" | "qwen-ocr">(),
parsedError: text("parsed_error"),
parsedAt: timestamp("parsed_at"),
```

`db:push` 同步；老行 `parsedStatus` 默认 `pending`，工具调用时遇到 `pending` 触发懒解析并写回。

### 6. 上传接口改造

`src/server/routes/chat/route.ts` `/uploads`：

```ts
const bytes = new Uint8Array(await file.arrayBuffer());

// 并行：S3 上传 + 解析
const [_, parsed] = await Promise.allSettled([
  putObjectBytes({ body: bytes, contentType: file.type, storageKey }),
  parseResumeFast(bytes),
]);

// S3 失败直接报错（解析失败可降级）
if (_.status === "rejected") {
  return c.json({ error: "Storage upload failed" }, 500);
}

const parseFields =
  parsed.status === "fulfilled"
    ? {
        parsedStatus: "ready" as const,
        parsedText: parsed.value.text,
        parsedStructured: parsed.value.structured,
        parsedPageCount: parsed.value.pageCount,
        parsedTextSource: parsed.value.textSource,
        parsedAt: new Date(),
      }
    : {
        parsedStatus: "failed" as const,
        parsedError: String(parsed.reason).slice(0, 500),
        parsedAt: new Date(),
      };

await createAttachment({ ...basicFields, ...parseFields });

return c.json({
  id: attachmentId,
  url: `/api/chat/attachments/${attachmentId}`,
  parseStatus: parseFields.parsedStatus,
});
```

### 7. screening / parser 接入持久化缓存

`src/server/routes/resume/screening.ts` 中的 `getCachedParseResume` / `getCachedParseResumeSubagent` 改为：

1. 从 `file.url`（`/api/chat/attachments/:id`）解析出 attachmentId
2. `getUserAttachment(userId, attachmentId)` 查持久化
3. 命中 `parsedStatus = 'ready'` → 直接返回 `ParsedResumePdf` / `ResumeParserResult` 形状
4. 未命中或 `pending` → 跑 `parseResumeFast` 并 **写回** 数据库（懒解析）
5. `failed` → 重试一次 `parseResumeFast`（避免缓存毒）

模块级 10 分钟内存缓存仍保留，作为同请求内多次工具调用的二级缓存。

### 8. 子 agent 简化

`src/server/agents/resume-parser-agent.ts`:

- 保留 `structuredSchema`、`ResumeParserResult`、`toResumeProfile`
- 删除 `buildResumeParserAgent`、`createExtractPdfTextTool`、`createAnalyzeWithVisionTool`、`extractWithVision`
- `parseResumeSubagent` 改为薄封装：

```ts
export async function parseResumeSubagent(
  file: UploadedResumePdf,
  options: ResumeParserOptions = {},
): Promise<ResumeParserResult> {
  const cached = await tryReadPersistedParse(file);
  if (cached) return cached;

  const bytes = await readPdfBytes(file.url);
  const result = await parseResumeFast(bytes);
  await tryWritePersistedParse(file, result);

  return {
    filename: file.filename,
    pageCount: result.pageCount,
    structured: result.structured,
    textSource: result.textSource,
  };
}
```

### 9. resume-analysis-agent 流式 NDJSON

`src/server/agents/resume-analysis-agent.ts` 通过 `streamParseResumeProfile` 给一键入库按钮发 NDJSON 事件。改造：

- 命中持久化时立即推 `tool-start: parse_resume` → `tool-end` → `result`，零 LLM
- 未命中时按 stage 推：`status: 解析 PDF`（pdf-parse） → 必要时 `status: 视觉识别` → `status: 提取结构化字段` → `result`

### 10. 一键入库 `/api/interview/parse-resume`

由于一键入库走的是 `File` 上传（不是 `chat_attachment`），无 attachmentId 可查；直接调 `parseResumeFast(bytes)` 即可，不持久化（这条路径与 chat 解耦）。

## 依赖 / 配置

```jsonc
// package.json (新增)
"pdfjs-dist": "^4"
"openai": "^4"  // 若已有则跳过
```

```env
# .env.example
QWEN_OCR_MODEL=qwen-vl-ocr-latest
QWEN_OCR_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
# 复用已有 ALIBABA_API_KEY
```

## 性能预期

| 场景                 | 现状                     | 改后                        |
| -------------------- | ------------------------ | --------------------------- |
| 文字型简历首轮       | 5–9s（含 2 次 LLM 决策） | 1.5–3s                      |
| 图片型简历首轮       | 8–12s（Gemini）          | 3–5s（Qwen OCR 并行）       |
| 同会话第二轮（命中） | ~1.5s（10min 内存缓存）  | <50ms（DB 命中 + 跳过 LLM） |
| LLM 调用次数         | 2–3                      | 1（仅结构化）               |

## 风险与缓解

1. **`pdfjs-dist` 在 Next.js standalone 打包**: 用 `legacy/build/pdf.mjs` + `disableWorker: true`，避免 worker 文件丢失。
2. **大 PDF**: `maxPages=6` 截断，OCR 只处理前 6 页；超出时附 `truncated: true` 字段提示。
3. **Qwen OCR 成本**: 1 页 ~2k img tokens × $0.043/M ≈ ¥0.001/页，可控。
4. **启发式漏判**: `generateResumeStructured` 返回空字段 ≥70% 时触发一次 OCR 重试，避免漏图片简历。
5. **解析阻塞上传体验**: pdf-parse + Qwen OCR + generateObject 串行约 1.5–5s，并发 S3 上传后总体感知 2–5s。前端上传期显示 "解析中" loading，复用现有按钮态。
6. **DB 字段污染**: `jsonb parsedStructured` 体积可控（典型 < 10KB），加 GIN index 暂不需要。
7. **`failed` 状态不缓存**: 解析失败的行 `parsedStatus = 'failed'` + `parsedError`，下次工具调用重试一次后若再失败则用 `pdf-parse` 原文兜底，不无限重试。
8. **Gemini 配置项**: `GOOGLE_VISION_MODEL` env / `extractWithVision` 整段删除；不再读 `AI_GATEWAY_API_KEY` 走视觉路径。

## Migration 步骤

1. 加依赖 + env
2. DB schema + `db:push`
3. 新 lib（rasterize / qwen-ocr / parse-pipeline）+ unit smoke test
4. 改 upload endpoint
5. 改 screening 缓存层 + parser-agent
6. 改 analysis-agent 流式
7. typecheck + lint + 手测一份文字 PDF + 一份图片 PDF
8. 删除 Gemini 视觉相关代码与 env
