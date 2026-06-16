// End-to-end deterministic resume parsing pipeline.
// Runs Qwen-VL OCR on every page of the PDF, then extracts structured
// candidate info via a single generateText / parseJsonOutput call.

import { setTimeout as delay } from "node:timers/promises";
import { generateText } from "ai";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import mammoth from "mammoth";
import { parseJsonOutput } from "@arc/ai-recruitment-copilot-backend/server/agents/json-output";
import { createAlibabaProvider } from "@arc/ai-recruitment-copilot-backend/server/agents/provider";
import { structuredSchema } from "@arc/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { getResumeDocumentKind } from "@arc/shared/resume-documents";
import { getRequiredEnv } from "./env";
import { rasterizePdfWithMeta } from "./pdf-rasterize";
import { isQwenOcrConfigured, qwenVlOcr } from "./qwen-ocr";

const STRUCTURED_TEXT_MAX_CHARS = 16_000;
const DEV_OCR_LOG_PREFIX = "[resume-ocr]";
const DEFAULT_OCR_ATTEMPTS = 3;
const DEFAULT_OCR_PAGE_CONCURRENCY = 1;
const DEFAULT_OCR_RETRY_DELAY_MS = 1000;
const OFFICE_TEXT_MAX_CHARS = 80_000;
const XLSX_MAX_SHEETS = 8;
const XLSX_MAX_ROWS_PER_SHEET = 200;

const STRUCTURED_INSTRUCTIONS = `你是一名简历解析助手。给你一段简历文本，请严格按照下方 JSON 结构输出结构化候选人档案。

## 输出 JSON 结构（字段名与类型必须严格匹配）

{
  "name": string | null,
  "age": number | null,
  "gender": string | null,
  "email": string | null,
  "phone": string | null,
  "schools": string[],
  "degree": string | null,
  "major": string | null,
  "graduationYear": string | null,
  "education": string | null,
  "targetRoles": string[],
  "workYears": number | null,
  "skills": string[],
  "personalStrengths": string[],
  "workExperiences": [
    { "company": string | null, "role": string | null, "period": string | null, "summary": string | null }
  ],
  "projectExperiences": [
    { "name": string | null, "role": string | null, "period": string | null, "summary": string | null, "techStack": string[] }
  ],
  "links": string[],
  "timelineSummary": {
    "currentStatus": string | null,
    "dateRanges": string[],
    "estimatedExperienceYears": number | null,
    "riskSignals": string[]
  }
}

## 输出约束
- 只输出 JSON 本身，不要任何额外解释文字，不要使用 Markdown 代码块。
- 无法从简历中确认的字段返回 null 或空数组，禁止编造。
- personalStrengths 必须有简历依据。
- skills / links / schools / targetRoles / personalStrengths 去重；skills 最多 18 项，其余最多 6 项。
- skills 字段必须使用业内通用规范名（保留通行大小写），不要写候选人简历里的别名 / 缩写 / 版本号 / .js 后缀：
    · "Vue 3" / "Vue.js" / "VueJS" / "vue" → "Vue"
    · "React.js" / "ReactJS" / "react" → "React"
    · "TS" → "TypeScript"
    · "JS" → "JavaScript"
    · "Node" / "NodeJS" / "node.js" → "Node.js"
    · "K8s" / "kubernetes" → "Kubernetes"
    · "Tailwind" / "TailwindCSS" → "Tailwind CSS"
    · "PG" / "Postgres" / "postgresql" → "PostgreSQL"
    · 当原文里出现品牌组合名时不要省略空格："ClaudeCode" → "Claude Code"。
    · 当某项无法判断业内规范名时，保留原文并 trim，不要瞎改。
- workExperiences / projectExperiences 按简历原文顺序排列；summary 保留关键职责、成果或内容，不扩写。
- projectExperiences 的每一项必须包含 techStack 字段（string[]），即使为空也要写 []。
- timelineSummary.dateRanges 保留原文时间表达。
- timelineSummary.riskSignals 仅在出现明确异常（时间重叠、6 个月以上空档、连续两段 8 个月内的短经历、未来时间段等）时填入，否则为空数组。
- timelineSummary.estimatedExperienceYears 为数字，不足一年用小数；无法推断时为 null。
- age 仅在简历明确给出时填数字，不要根据毕业年份推测。`;

export type ResumeTextSource =
  | "qwen-ocr"
  | "docx-text"
  | "pptx-text"
  | "xlsx-text"
  | "external-verify-parse";
export {
  getResumeDocumentExtension,
  isSupportedResumeDocumentInput,
} from "@arc/shared/resume-documents";

export interface ResumeDocumentInput {
  bytes: Uint8Array;
  fileName?: string;
  mediaType?: string;
}

export interface ParsedResumeOcr {
  text: string;
  pageCount: number;
  textSource: ResumeTextSource;
}

export interface ParsedResumeFast extends ParsedResumeOcr {
  structured: ResumeParserStructured;
}

const xmlParser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
});

function clipForStructured(text: string): string {
  if (text.length <= STRUCTURED_TEXT_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, STRUCTURED_TEXT_MAX_CHARS)}\n\n[...content truncated...]`;
}

function clipOfficeText(text: string): string {
  if (text.length <= OFFICE_TEXT_MAX_CHARS) {
    return text;
  }
  return `${text.slice(0, OFFICE_TEXT_MAX_CHARS)}\n\n[...content truncated...]`;
}

function normalizeExtractedText(text: string): string {
  return clipOfficeText(
    text
      .replaceAll("\r\n", "\n")
      .replaceAll("\r", "\n")
      .split("\n")
      .map((line) => line.replaceAll(/[^\S\n\t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n"),
  );
}

function inferImageMediaType(input: { fileName?: string; mediaType?: string }): string {
  const normalizedMediaType = input.mediaType?.trim().toLowerCase();
  if (normalizedMediaType === "image/jpeg" || normalizedMediaType === "image/png") {
    return normalizedMediaType;
  }
  const extension = input.fileName
    ?.trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/u)?.[1];
  if (extension === "jpg" || extension === "jpeg") {
    return "image/jpeg";
  }
  if (extension === "png") {
    return "image/png";
  }
  return "image/png";
}

function isDevOcrLogEnabled(): boolean {
  const raw = process.env.RESUME_PARSE_LOG_STEPS?.trim().toLowerCase();
  return process.env.NODE_ENV === "development" || raw === "1" || raw === "true" || raw === "yes";
}

function nowMs(): number {
  return performance.now();
}

function formatDuration(startedAt: number): string {
  return `${Math.round(nowMs() - startedAt)}ms`;
}

function devOcrLog(message: string, data?: Record<string, unknown>): void {
  if (!isDevOcrLogEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info(DEV_OCR_LOG_PREFIX, message, data ?? "");
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function isTransientOcrError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const maybeCode = "code" in error ? String(error.code) : "";
  const message = error.message.toLowerCase();
  return (
    maybeCode === "ECONNRESET" ||
    maybeCode === "ETIMEDOUT" ||
    maybeCode === "ECONNREFUSED" ||
    maybeCode === "ENOTFOUND" ||
    maybeCode === "UND_ERR_CONNECT_TIMEOUT" ||
    message.includes("connection error") ||
    message.includes("fetch failed") ||
    message.includes("timeout") ||
    message.includes("socket")
  );
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await delay(ms);
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

function parseXml(xml: string): unknown {
  return xmlParser.parse(xml);
}

function localName(name: string): string {
  return name.includes(":") ? (name.split(":").pop() ?? name) : name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function getChildren(node: unknown, childLocalName: string): unknown[] {
  if (!isRecord(node)) {
    return [];
  }
  const results: unknown[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) {
      continue;
    }
    if (localName(key) === childLocalName) {
      results.push(...asArray(value));
    }
  }
  return results;
}

function getFirstChild(node: unknown, childLocalName: string): unknown {
  return getChildren(node, childLocalName)[0];
}

function findFirstDescendant(node: unknown, descendantLocalName: string): unknown {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findFirstDescendant(item, descendantLocalName);
      if (found !== undefined) {
        return found;
      }
    }
    return undefined;
  }
  if (!isRecord(node)) {
    return undefined;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) {
      continue;
    }
    if (localName(key) === descendantLocalName) {
      return value;
    }
    const found = findFirstDescendant(value, descendantLocalName);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function readAttribute(node: unknown, attributeName: string): string | null {
  if (!isRecord(node)) {
    return null;
  }
  const direct = node[`@_${attributeName}`];
  if (typeof direct === "string") {
    return direct;
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      key.startsWith("@_") &&
      localName(key.slice(2)) === attributeName &&
      typeof value === "string"
    ) {
      return value;
    }
  }
  return null;
}

function collectXmlTextByLocalName(node: unknown, textLocalName: string, output: string[]): void {
  if (typeof node === "string" || typeof node === "number") {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      collectXmlTextByLocalName(item, textLocalName, output);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith("@_")) {
      continue;
    }
    if (localName(key) === textLocalName) {
      for (const textNode of asArray(value)) {
        if (typeof textNode === "string" || typeof textNode === "number") {
          output.push(String(textNode));
        } else if (isRecord(textNode) && typeof textNode["#text"] === "string") {
          output.push(textNode["#text"]);
        }
      }
      continue;
    }
    collectXmlTextByLocalName(value, textLocalName, output);
  }
}

function extractXmlText(xml: string, textLocalName = "t"): string[] {
  const texts: string[] = [];
  collectXmlTextByLocalName(parseXml(xml), textLocalName, texts);
  return texts.map((text) => text.trim()).filter(Boolean);
}

function loadZip(bytes: Uint8Array): Promise<JSZip> {
  return JSZip.loadAsync(Buffer.from(bytes));
}

async function readZipText(zip: JSZip, path: string): Promise<string | null> {
  const file = zip.file(path);
  return file ? await file.async("string") : null;
}

async function extractDocxText(bytes: Uint8Array): Promise<ParsedResumeOcr> {
  const mammothResult = await mammoth
    .extractRawText({ buffer: Buffer.from(bytes) })
    .catch(() => null);
  const mammothText = normalizeExtractedText(mammothResult?.value ?? "");
  if (mammothText) {
    return { pageCount: 1, text: mammothText, textSource: "docx-text" };
  }

  const zip = await loadZip(bytes);
  const documentXml = await readZipText(zip, "word/document.xml");
  if (!documentXml) {
    throw new Error("DOCX document.xml not found.");
  }
  const text = normalizeExtractedText(extractXmlText(documentXml).join("\n"));
  if (!text) {
    throw new Error("DOCX text extraction returned empty text.");
  }
  return { pageCount: 1, text, textSource: "docx-text" };
}

async function extractPptxText(bytes: Uint8Array): Promise<ParsedResumeOcr> {
  const zip = await loadZip(bytes);
  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/u.test(path))
    .toSorted((left, right) => {
      const leftIndex = Number(left.match(/slide(\d+)\.xml$/u)?.[1] ?? 0);
      const rightIndex = Number(right.match(/slide(\d+)\.xml$/u)?.[1] ?? 0);
      return leftIndex - rightIndex;
    });
  if (slidePaths.length === 0) {
    throw new Error("PPTX slides not found.");
  }

  const slideTexts: string[] = [];
  for (const [index, path] of slidePaths.entries()) {
    const xml = await readZipText(zip, path);
    const text = normalizeExtractedText(xml ? extractXmlText(xml).join("\n") : "");
    if (text) {
      slideTexts.push(`[Slide ${index + 1}]\n${text}`);
    }
  }
  const text = normalizeExtractedText(slideTexts.join("\n\n"));
  if (!text) {
    throw new Error("PPTX text extraction returned empty text.");
  }
  return { pageCount: slidePaths.length, text, textSource: "pptx-text" };
}

function getXmlRoot(parsed: unknown, rootLocalName: string): unknown {
  if (!isRecord(parsed)) {
    return undefined;
  }
  for (const [key, value] of Object.entries(parsed)) {
    if (localName(key) === rootLocalName) {
      return value;
    }
  }
  return undefined;
}

function resolveXlsxTarget(target: string): string {
  const normalized = target.replace(/^\/+/u, "");
  return normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
}

function extractTextFromParsedNode(node: unknown): string {
  const texts: string[] = [];
  collectXmlTextByLocalName(node, "t", texts);
  return normalizeExtractedText(texts.join("\n"));
}

function readCellText(cell: unknown, sharedStrings: string[]): string | null {
  const cellType = readAttribute(cell, "t");
  if (cellType === "inlineStr") {
    const inlineString = getFirstChild(cell, "is");
    const text = extractTextFromParsedNode(inlineString);
    return text || null;
  }
  const valueNode = getFirstChild(cell, "v");
  const rawValue =
    typeof valueNode === "string" || typeof valueNode === "number" ? String(valueNode).trim() : "";
  if (!rawValue) {
    return null;
  }
  if (cellType === "s") {
    return sharedStrings[Number(rawValue)] ?? null;
  }
  return rawValue;
}

async function extractXlsxText(bytes: Uint8Array): Promise<ParsedResumeOcr> {
  const zip = await loadZip(bytes);
  const sharedStringsXml = await readZipText(zip, "xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml
    ? getChildren(getXmlRoot(parseXml(sharedStringsXml), "sst"), "si").map(
        extractTextFromParsedNode,
      )
    : [];

  const workbookXml = await readZipText(zip, "xl/workbook.xml");
  if (!workbookXml) {
    throw new Error("XLSX workbook.xml not found.");
  }
  const workbook = getXmlRoot(parseXml(workbookXml), "workbook");
  const sheets = getChildren(findFirstDescendant(workbook, "sheets"), "sheet").slice(
    0,
    XLSX_MAX_SHEETS,
  );
  if (sheets.length === 0) {
    throw new Error("XLSX sheets not found.");
  }

  const relsXml = await readZipText(zip, "xl/_rels/workbook.xml.rels");
  const relationshipById = new Map<string, string>();
  if (relsXml) {
    const relsRoot = getXmlRoot(parseXml(relsXml), "Relationships");
    for (const relationship of getChildren(relsRoot, "Relationship")) {
      const id = readAttribute(relationship, "Id");
      const target = readAttribute(relationship, "Target");
      if (id && target) {
        relationshipById.set(id, resolveXlsxTarget(target));
      }
    }
  }

  const sheetBlocks: string[] = [];
  for (const [sheetIndex, sheet] of sheets.entries()) {
    const sheetName = readAttribute(sheet, "name") ?? `Sheet ${sheetIndex + 1}`;
    const relationshipId = readAttribute(sheet, "id");
    const path =
      (relationshipId ? relationshipById.get(relationshipId) : null) ??
      `xl/worksheets/sheet${sheetIndex + 1}.xml`;
    const xml = await readZipText(zip, path);
    if (!xml) {
      continue;
    }

    const worksheet = getXmlRoot(parseXml(xml), "worksheet");
    const rows = getChildren(findFirstDescendant(worksheet, "sheetData"), "row").slice(
      0,
      XLSX_MAX_ROWS_PER_SHEET,
    );
    const rowTexts = rows
      .map((row) =>
        getChildren(row, "c")
          .map((cell) => readCellText(cell, sharedStrings))
          .filter((value): value is string => Boolean(value?.trim()))
          .join("\t"),
      )
      .filter(Boolean);
    if (rowTexts.length > 0) {
      sheetBlocks.push(`[Sheet: ${sheetName}]\n${rowTexts.join("\n")}`);
    }
  }

  const text = normalizeExtractedText(sheetBlocks.join("\n\n"));
  if (!text) {
    throw new Error("XLSX text extraction returned empty text.");
  }
  return { pageCount: sheetBlocks.length, text, textSource: "xlsx-text" };
}

async function qwenVlOcrWithRetry(
  imageBytes: Buffer,
  page: number,
  mediaType = "image/png",
): Promise<string> {
  const attempts = parsePositiveInteger(
    process.env.RESUME_PARSE_OCR_ATTEMPTS,
    DEFAULT_OCR_ATTEMPTS,
  );
  const retryDelayMs = parseNonNegativeInteger(
    process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS,
    DEFAULT_OCR_RETRY_DELAY_MS,
  );
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await qwenVlOcr(imageBytes, mediaType);
    } catch (error) {
      if (attempt >= attempts || !isTransientOcrError(error)) {
        throw error;
      }
      devOcrLog("page retry", {
        attempt,
        errorMessage: error instanceof Error ? error.message : String(error),
        page,
      });
      await sleep(retryDelayMs * attempt);
    }
  }
  throw new Error("Qwen OCR retry loop exited unexpectedly.");
}

async function extractImageText(input: ResumeDocumentInput): Promise<ParsedResumeOcr> {
  if (!isQwenOcrConfigured()) {
    throw new Error("Qwen OCR is not configured (missing ALIBABA_API_KEY).");
  }

  const mediaType = inferImageMediaType(input);
  const startedAt = nowMs();
  const text = await qwenVlOcrWithRetry(Buffer.from(input.bytes), 1, mediaType);
  devOcrLog("image ocr completed", {
    bytes: input.bytes.byteLength,
    duration: formatDuration(startedAt),
    mediaType,
    outputChars: text.length,
  });

  if (text.trim().length === 0) {
    throw new Error("Qwen OCR returned empty text for the image resume.");
  }

  return { pageCount: 1, text, textSource: "qwen-ocr" };
}

export async function generateResumeStructured(text: string): Promise<ResumeParserStructured> {
  const startedAt = nowMs();
  const provider = createAlibabaProvider({ enableThinking: false });
  const modelId = getRequiredEnv("ALIBABA_STRUCTURED_MODEL");
  devOcrLog("structured start", {
    baseUrl: getRequiredEnv("ALIBABA_BASE_URL"),
    inputChars: text.length,
    model: modelId,
  });
  const { text: rawOutput } = await generateText({
    // 中文简历每字约 1 token，加上 projectExperiences/workExperiences 等结构开销，
    // 项目/经历较多的简历输出会很长，给到 16384 留足余量避免 summary 中途截断。
    // Chinese resumes use ~1 token per character; with verbose project / work
    // experience summaries the output can be very long, so allow 16384 to leave
    // headroom and avoid truncating mid-string.
    maxOutputTokens: 16_384,
    model: provider(modelId),
    prompt: `${STRUCTURED_INSTRUCTIONS}\n\n简历文本：\n${clipForStructured(text)}`,
    temperature: 0,
  });
  devOcrLog("structured completed", {
    duration: formatDuration(startedAt),
    inputChars: text.length,
    model: modelId,
    outputChars: rawOutput.length,
  });
  return parseJsonOutput(rawOutput, structuredSchema, "resume-parse-pipeline");
}

/**
 * OCR-only: rasterize PDF → Qwen-VL OCR → 返回纯文本与页数。
 * 不跑结构化抽取，让调用方在真正需要 LLM 结构化时再单独跑。
 *
 * OCR-only path: rasterize + Qwen-VL OCR. Returns plain text & page count;
 * callers run structured extraction separately when they actually need it.
 */
export async function parseResumeOcrOnly(bytes: Uint8Array): Promise<ParsedResumeOcr> {
  const totalStartedAt = nowMs();
  if (!isQwenOcrConfigured()) {
    throw new Error("Qwen OCR is not configured (missing ALIBABA_API_KEY).");
  }

  devOcrLog("start", { bytes: bytes.byteLength, maxPages: 6, scale: 2 });
  const rasterizeStartedAt = nowMs();
  const { pages, pageCount } = await rasterizePdfWithMeta(bytes, { maxPages: 6, scale: 2 });
  devOcrLog("rasterize completed", {
    duration: formatDuration(rasterizeStartedAt),
    pageCount,
    renderedPages: pages.length,
    renderedSizes: pages.map((page) => page.byteLength),
  });

  if (pages.length === 0) {
    throw new Error("Rasterization produced no pages; PDF may be empty or unreadable.");
  }

  const ocrStartedAt = nowMs();
  const pageConcurrency = parsePositiveInteger(
    process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY,
    DEFAULT_OCR_PAGE_CONCURRENCY,
  );
  const ocrTexts = await runWithConcurrency(pages, pageConcurrency, async (png, index) => {
    const pageStartedAt = nowMs();
    const text = await qwenVlOcrWithRetry(png, index + 1);
    devOcrLog("page completed", {
      chars: text.length,
      duration: formatDuration(pageStartedAt),
      page: index + 1,
      pngBytes: png.byteLength,
    });
    return text;
  });
  const text = ocrTexts.filter((chunk) => chunk.trim().length > 0).join("\n\n");
  devOcrLog("ocr completed", {
    duration: formatDuration(ocrStartedAt),
    outputChars: text.length,
    pages: pages.length,
  });

  if (text.trim().length === 0) {
    throw new Error("Qwen OCR returned empty text for every page.");
  }

  devOcrLog("completed", {
    duration: formatDuration(totalStartedAt),
    outputChars: text.length,
    pageCount,
    renderedPages: pages.length,
  });
  return { pageCount, text, textSource: "qwen-ocr" };
}

export function extractResumeDocumentText(input: ResumeDocumentInput): Promise<ParsedResumeOcr> {
  const kind = getResumeDocumentKind(input);
  if (!kind) {
    throw new Error("仅支持上传 PDF、DOCX、PPTX、XLSX、JPG、PNG 简历。");
  }

  switch (kind) {
    case "pdf": {
      return parseResumeOcrOnly(input.bytes);
    }
    case "docx": {
      return extractDocxText(input.bytes);
    }
    case "pptx": {
      return extractPptxText(input.bytes);
    }
    case "xlsx": {
      return extractXlsxText(input.bytes);
    }
    case "image": {
      return extractImageText(input);
    }
    default: {
      throw new Error("仅支持上传 PDF、DOCX、PPTX、XLSX、JPG、PNG 简历。");
    }
  }
}

/**
 * 完整解析：OCR + 结构化抽取。
 * 现在内部由 parseResumeOcrOnly + generateResumeStructured 两步组合而成，
 * 行为与拆分前等价，保留导出以便那些一次性需要结构化结果的调用方继续用。
 *
 * Full pipeline: OCR + structured extraction. Now a composition of
 * parseResumeOcrOnly + generateResumeStructured. Behavior is unchanged from
 * the pre-split version; callers that want both in one shot keep using this.
 */
export async function parseResumeFast(
  input: Uint8Array | ResumeDocumentInput,
): Promise<ParsedResumeFast> {
  const startedAt = nowMs();
  const documentInput =
    input instanceof Uint8Array ? { bytes: input, mediaType: "application/pdf" } : input;
  devOcrLog("full parse start", { bytes: documentInput.bytes.byteLength });
  const ocr = await extractResumeDocumentText(documentInput);
  devOcrLog("structured dispatch", {
    inputChars: ocr.text.length,
    pageCount: ocr.pageCount,
  });
  const structured = await generateResumeStructured(ocr.text);
  devOcrLog("full parse completed", {
    duration: formatDuration(startedAt),
    outputChars: ocr.text.length,
    pageCount: ocr.pageCount,
  });
  return { ...ocr, structured };
}
