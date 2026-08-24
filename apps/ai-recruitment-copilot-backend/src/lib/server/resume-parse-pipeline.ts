// End-to-end deterministic resume parsing pipeline.
// Runs Qwen-VL OCR on every page of the PDF, then extracts structured
// candidate info via a schema-constrained Mastra agent call.
/* oxlint-disable max-lines -- Document formats and their shared OCR pipeline stay together. */

import { setTimeout as delay } from "node:timers/promises";
import { convert as htmlToText } from "html-to-text";
import mammoth from "mammoth";
import pRetry from "p-retry";
import { z } from "zod";
import {
  normalizeResumeStructuredSourceFileName,
  resumeParserGenerationSchema,
} from "@arc/db-schema/resume-parser-schema";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import type { AttachmentTextSource } from "@arc/db-schema/db-enums";
import { getResumeDocumentKind } from "@arc/shared/resume-documents";
import {
  collectOfficeXmlText as collectXmlTextByLocalName,
  extractOfficeXmlText as extractXmlText,
  findFirstOfficeXmlDescendant as findFirstDescendant,
  getFirstOfficeXmlChild as getFirstChild,
  getOfficeXmlChildren as getChildren,
  loadOfficeZip as loadZip,
  parseOfficeXml as parseXml,
  readOfficeXmlAttribute as readAttribute,
  readOfficeZipText as readZipText,
} from "./office-xml";
import type { OfficeXmlNode } from "./office-xml";
import { defaultResumeParsePipelineDependencies } from "./resume-parse-pipeline-dependencies";
import type { ResumeParsePipelineDependencies } from "./resume-parse-pipeline-dependencies";
import { RESUME_STRUCTURED_INSTRUCTIONS } from "./resume-structured-instructions";

export type { ResumeParsePipelineDependencies } from "./resume-parse-pipeline-dependencies";

const STRUCTURED_TEXT_MAX_CHARS = 16_000;
const DEV_OCR_LOG_PREFIX = "[resume-ocr]";
const DEFAULT_OCR_ATTEMPTS = 3;
const DEFAULT_OCR_PAGE_CONCURRENCY = 4;
const DEFAULT_OCR_RENDER_SCALE = 4;
const DEFAULT_OCR_RETRY_DELAY_MS = 1000;
const OFFICE_TEXT_MAX_CHARS = 80_000;
const XLSX_MAX_SHEETS = 8;
const XLSX_MAX_ROWS_PER_SHEET = 200;
const OCR_PAGE_TEXT_PREVIEW_MAX_CHARS = 300;
const PDF_TEXT_SUPPLEMENT_MAX_CHARS = 4000;
const PDF_TEXT_SUPPLEMENT_HEADING =
  "[PDF 文本层补充信息：仅补足 OCR 可能遗漏的可见文字；如有冲突，以前面的 OCR 正文为准]";
const RESUME_DATE_LINE_PATTERN = /(?<!\d)(?:19|20)\d{2}(?!\d)/;

export { RESUME_STRUCTURED_INSTRUCTIONS } from "./resume-structured-instructions";

export type ResumeTextSource = Exclude<AttachmentTextSource, "pdf-parse">;
export {
  getResumeDocumentExtension,
  isSupportedResumeDocumentInput,
} from "@arc/shared/resume-documents";

export interface ResumeDocumentInput {
  bytes: Uint8Array;
  fileName?: string;
  mediaType?: string;
  onProgress?: (event: ResumeParseProgressEvent) => void;
}

export interface ParsedResumeOcr {
  text: string;
  pageCount: number;
  textSource: ResumeTextSource;
}

export interface ParsedResumeFast extends ParsedResumeOcr {
  structured: ResumeParserStructured;
}

export type ParsedResumeDocument = ParsedResumeOcr | ParsedResumeFast;

export type ResumeParseProgressEvent =
  | {
      renderedPages: number;
      totalPages: number;
      type: "document.pages.ready";
    }
  | {
      page: number;
      totalPages: number;
      type: "ocr.page.started";
    }
  | {
      charCount: number;
      page: number;
      textPreview: string;
      totalPages: number;
      type: "ocr.page.completed";
    }
  | {
      outputChars: number;
      renderedPages: number;
      totalPages: number;
      type: "ocr.completed";
    };

function prioritizePdfTextSupplement(supplement: string): string {
  const [heading = PDF_TEXT_SUPPLEMENT_HEADING, ...bodyLines] = supplement.split("\n");
  const dateIndexes = bodyLines.flatMap((line, index) =>
    RESUME_DATE_LINE_PATTERN.test(line) ? [index] : [],
  );
  if (dateIndexes.length === 0) {
    return supplement.slice(0, PDF_TEXT_SUPPLEMENT_MAX_CHARS);
  }

  const contextIndexes = new Set<number>();
  for (const index of dateIndexes) {
    contextIndexes.add(Math.max(0, index - 2));
    contextIndexes.add(Math.max(0, index - 1));
    contextIndexes.add(index);
  }
  const criticalDates = dateIndexes.map((index) => bodyLines[index]?.slice(0, 240)).join("\n");
  const dateContexts = [...contextIndexes]
    .toSorted((left, right) => left - right)
    .map((index) => bodyLines[index]?.slice(0, 320))
    .join("\n");
  const remaining = bodyLines.filter((_, index) => !contextIndexes.has(index)).join("\n");
  return `${heading}\n[优先保留的日期字段]\n${criticalDates}\n[日期字段上下文]\n${dateContexts}\n[其他补充]\n${remaining}`.slice(
    0,
    PDF_TEXT_SUPPLEMENT_MAX_CHARS,
  );
}

function clipForStructured(text: string): string {
  if (text.length <= STRUCTURED_TEXT_MAX_CHARS) {
    return text;
  }
  const supplementStart = text.indexOf(`\n\n${PDF_TEXT_SUPPLEMENT_HEADING}`);
  if (supplementStart !== -1) {
    const ocrText = text.slice(0, supplementStart);
    const supplement = prioritizePdfTextSupplement(text.slice(supplementStart + 2));
    const suffix = `\n\n[...OCR content truncated...]\n\n${supplement}`;
    return `${ocrText.slice(0, STRUCTURED_TEXT_MAX_CHARS - suffix.length)}${suffix}`;
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

function compactTextForCoverage(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replaceAll(/[\s\p{P}\p{S}]+/gu, "");
}

function isLikelyDecorativePdfText(line: string): boolean {
  const compact = line.replaceAll(/\s+/g, "");
  return (
    compact.length >= 32 &&
    /^[A-Za-z0-9_~-]+$/.test(compact) &&
    /[a-z]/.test(compact) &&
    /[A-Z]/.test(compact) &&
    /\d/.test(compact)
  );
}

function buildPdfTextSupplement(ocrPages: string[], textPages: string[]): string | null {
  const pageBlocks: string[] = [];
  for (const [pageIndex, pageText] of textPages.entries()) {
    const compactOcrPage = compactTextForCoverage(ocrPages[pageIndex] ?? "");
    const lines = pageText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => compactTextForCoverage(line).length >= 4)
      .filter((line) => !isLikelyDecorativePdfText(line));
    const missingIndexes = lines.flatMap((line, index) =>
      compactOcrPage.includes(compactTextForCoverage(line)) ? [] : [index],
    );
    if (missingIndexes.length === 0) {
      continue;
    }
    const selectedIndexes = new Set(missingIndexes);
    for (const index of missingIndexes) {
      if (!RESUME_DATE_LINE_PATTERN.test(lines[index] ?? "")) {
        continue;
      }
      selectedIndexes.add(Math.max(0, index - 1));
      selectedIndexes.add(Math.max(0, index - 2));
    }
    const supplementalLines = [...selectedIndexes]
      .toSorted((left, right) => left - right)
      .map((index) => lines[index])
      .filter((line): line is string => Boolean(line));
    pageBlocks.push(`[第 ${pageIndex + 1} 页]\n${supplementalLines.join("\n")}`);
  }
  return pageBlocks.length > 0
    ? `${PDF_TEXT_SUPPLEMENT_HEADING}\n${pageBlocks.join("\n\n")}`
    : null;
}

function validateOcrTextQuality(text: string): void {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const coordinateLines = lines.filter((line) => /^\d+(?:,\d+){4,}$/u.test(line)).length;
  if (coordinateLines >= 10 && coordinateLines / lines.length >= 0.6) {
    throw new Error("OCR output is a coordinate dump instead of readable resume text.");
  }
}

function emitResumeParseProgress(
  onProgress: ResumeDocumentInput["onProgress"] | undefined,
  event: ResumeParseProgressEvent,
) {
  onProgress?.(event);
}

function toOcrTextPreview(text: string) {
  return text.trim().replaceAll(/\s+/g, " ").slice(0, OCR_PAGE_TEXT_PREVIEW_MAX_CHARS);
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

type OcrLogValue = boolean | null | number | string | undefined;
type OcrLogData = Record<string, OcrLogValue | OcrLogValue[]>;

function devOcrLog(message: string, data?: OcrLogData): void {
  if (!isDevOcrLogEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info(DEV_OCR_LOG_PREFIX, message, data ?? "");
}

async function extractPdfTextPagesBestEffort(
  bytes: Uint8Array,
  dependencies: ResumeParsePipelineDependencies,
) {
  try {
    return await dependencies.extractPdfTextPages(bytes, 6);
  } catch (error) {
    devOcrLog("PDF text layer unavailable", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
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

function isTransientOcrError(error: Error): boolean {
  const parsedCode = z.object({ code: z.string() }).safeParse(error);
  const maybeCode = parsedCode.success ? parsedCode.data.code : "";
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

class RetriableOcrTypeError extends Error {
  readonly originalError: TypeError;

  constructor(error: TypeError) {
    super(error.message);
    this.name = "RetriableOcrTypeError";
    this.originalError = error;
  }
}

function normalizeOcrRetryError(error: Error): Error {
  if (error instanceof TypeError && isTransientOcrError(error)) {
    return new RetriableOcrTypeError(error);
  }
  return error;
}

function restoreOcrRetryError(error: Error): never {
  if (error instanceof RetriableOcrTypeError) {
    throw error.originalError;
  }
  throw error;
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

function getXmlRoot(parsed: OfficeXmlNode, rootLocalName: string): OfficeXmlNode | undefined {
  return findFirstDescendant(parsed, rootLocalName);
}

function resolveXlsxTarget(target: string): string {
  const normalized = target.replace(/^\/+/u, "");
  return normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
}

function extractTextFromParsedNode(node: OfficeXmlNode | undefined): string {
  const texts: string[] = [];
  collectXmlTextByLocalName(node, "t", texts);
  return normalizeExtractedText(texts.join("\n"));
}

function readCellText(cell: OfficeXmlNode, sharedStrings: string[]): string | null {
  const cellType = readAttribute(cell, "t");
  if (cellType === "inlineStr") {
    const inlineString = getFirstChild(cell, "is");
    const text = extractTextFromParsedNode(inlineString);
    return text || null;
  }
  const valueNode = getFirstChild(cell, "v");
  const parsedValue = z.union([z.string(), z.number()]).safeParse(valueNode);
  const rawValue = parsedValue.success ? String(parsedValue.data).trim() : "";
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

function extractHtmlText(bytes: Uint8Array): ParsedResumeOcr {
  const html = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const text = normalizeExtractedText(
    htmlToText(html, {
      baseElements: {
        selectors: ["body"],
      },
      selectors: [
        { format: "skip", selector: "script" },
        { format: "skip", selector: "style" },
        { options: { ignoreHref: true }, selector: "a" },
        { format: "skip", selector: "img" },
      ],
      wordwrap: false,
    }),
  );
  if (!text) {
    throw new Error("HTML text extraction returned empty text.");
  }
  return { pageCount: 1, text, textSource: "html-text" };
}

async function qwenVlOcrWithRetry(
  imageBytes: Buffer,
  page: number,
  mediaType = "image/png",
  dependencies: ResumeParsePipelineDependencies = defaultResumeParsePipelineDependencies,
): Promise<string> {
  const attempts = parsePositiveInteger(
    process.env.RESUME_PARSE_OCR_ATTEMPTS,
    DEFAULT_OCR_ATTEMPTS,
  );
  const retryDelayMs = parseNonNegativeInteger(
    process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS,
    DEFAULT_OCR_RETRY_DELAY_MS,
  );
  try {
    return await pRetry(
      async () => {
        try {
          return await dependencies.qwenVlOcr(imageBytes, mediaType);
        } catch (error) {
          const normalizedError = error instanceof Error ? error : new Error(String(error));
          throw normalizeOcrRetryError(normalizedError);
        }
      },
      {
        factor: 1,
        maxTimeout: 0,
        minTimeout: 0,
        onFailedAttempt: async ({ attemptNumber, error, retriesLeft }) => {
          if (retriesLeft <= 0 || !isTransientOcrError(error)) {
            return;
          }
          devOcrLog("page retry", {
            attempt: attemptNumber,
            errorMessage: error.message,
            page,
          });
          const delayMs = retryDelayMs * attemptNumber;
          if (delayMs > 0) {
            await delay(delayMs);
          }
        },
        retries: Math.max(0, attempts - 1),
        shouldRetry: ({ error }) => isTransientOcrError(error),
      },
    );
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    return restoreOcrRetryError(normalizedError);
  }
}

async function extractImageText(
  input: ResumeDocumentInput,
  dependencies: ResumeParsePipelineDependencies = defaultResumeParsePipelineDependencies,
): Promise<ParsedResumeOcr> {
  if (!dependencies.isQwenOcrConfigured()) {
    throw new Error("Qwen OCR is not configured (missing ALIBABA_API_KEY).");
  }

  const mediaType = inferImageMediaType(input);
  const startedAt = nowMs();
  emitResumeParseProgress(input.onProgress, {
    renderedPages: 1,
    totalPages: 1,
    type: "document.pages.ready",
  });
  emitResumeParseProgress(input.onProgress, {
    page: 1,
    totalPages: 1,
    type: "ocr.page.started",
  });
  const text = await qwenVlOcrWithRetry(Buffer.from(input.bytes), 1, mediaType, dependencies);
  emitResumeParseProgress(input.onProgress, {
    charCount: text.length,
    page: 1,
    textPreview: toOcrTextPreview(text),
    totalPages: 1,
    type: "ocr.page.completed",
  });
  devOcrLog("image ocr completed", {
    bytes: input.bytes.byteLength,
    duration: formatDuration(startedAt),
    mediaType,
    outputChars: text.length,
  });

  if (text.trim().length === 0) {
    throw new Error("Qwen OCR returned empty text for the image resume.");
  }
  validateOcrTextQuality(text);

  emitResumeParseProgress(input.onProgress, {
    outputChars: text.length,
    renderedPages: 1,
    totalPages: 1,
    type: "ocr.completed",
  });
  return { pageCount: 1, text, textSource: "qwen-ocr" };
}

function validateGeneratedResumeStructured(output: ResumeParserStructured): void {
  const missingValuePlaceholders = new Set(["不详", "未发现信息", "未提供", "未知", "无"]);
  if (output.name && missingValuePlaceholders.has(output.name.trim())) {
    throw new Error("name 不得使用缺失占位值，缺失时应返回 null");
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const skill of output.skills) {
    const normalized = skill.trim().replaceAll(/\s+/g, " ").toLocaleLowerCase("en-US");
    if (seen.has(normalized)) {
      duplicates.add(skill.trim());
    }
    seen.add(normalized);
  }
  if (duplicates.size > 0) {
    throw new Error(`skills 包含重复项：${[...duplicates].join("、")}`);
  }
}

export async function generateResumeStructured(
  text: string,
  options: { fileName?: string } = {},
  dependencies: ResumeParsePipelineDependencies = defaultResumeParsePipelineDependencies,
): Promise<ResumeParserStructured> {
  const startedAt = nowMs();
  const fileName = options.fileName
    ? normalizeResumeStructuredSourceFileName(options.fileName)
    : undefined;
  const fileContext = fileName
    ? `\n\n简历文件信息：\n- 简历文件名：${JSON.stringify(fileName)}\n- 文件名可能包含候选人姓名（用户名），可作为 name 字段的辅助线索；若与简历正文冲突，以简历正文中的明确事实为准。文件名中的岗位、薪资、平台标签等不得直接当作候选人事实。`
    : "";
  devOcrLog("structured start", {
    fileNameIncluded: Boolean(fileName),
    inputChars: text.length,
  });
  const output = await dependencies.generateStructuredWithMastraAgent({
    agent: dependencies.resumeStructuredAgent,
    fallbackToTextGeneration: true,
    // Long resumes can legitimately produce large work/project evidence snapshots.
    // Keep thinking disabled at the agent model and reserve 32K for the final JSON.
    maxOutputTokens: 32_768,
    observabilityLabel: "resume-structure",
    prompt: `${RESUME_STRUCTURED_INSTRUCTIONS}${fileContext}\n\n简历文本：\n${clipForStructured(text)}`,
    retryOnInvalid: true,
    retryOnTransient: true,
    schema: resumeParserGenerationSchema,
    temperature: 0,
    validate: validateGeneratedResumeStructured,
  });
  devOcrLog("structured completed", {
    duration: formatDuration(startedAt),
    inputChars: text.length,
    outputChars: JSON.stringify(output).length,
  });
  return fileName ? { ...output, sourceFileName: fileName } : output;
}

/**
 * OCR-only: rasterize PDF → Qwen-VL OCR → 返回纯文本与页数。
 * 不跑结构化抽取，让调用方在真正需要 LLM 结构化时再单独跑。
 *
 * OCR-only path: rasterize + Qwen-VL OCR. Returns plain text & page count;
 * callers run structured extraction separately when they actually need it.
 */
export async function parseResumeOcrOnly(
  bytes: Uint8Array,
  options: { onProgress?: ResumeDocumentInput["onProgress"] } = {},
  dependencies: ResumeParsePipelineDependencies = defaultResumeParsePipelineDependencies,
): Promise<ParsedResumeOcr> {
  const totalStartedAt = nowMs();
  if (!dependencies.isQwenOcrConfigured()) {
    throw new Error("Qwen OCR is not configured (missing ALIBABA_API_KEY).");
  }

  devOcrLog("start", {
    bytes: bytes.byteLength,
    maxPages: 6,
    scale: DEFAULT_OCR_RENDER_SCALE,
  });
  const ocrStartedAt = nowMs();
  const textLayerPromise = extractPdfTextPagesBestEffort(bytes, dependencies);
  const pageConcurrency = parsePositiveInteger(
    process.env.RESUME_PARSE_OCR_PAGE_CONCURRENCY,
    DEFAULT_OCR_PAGE_CONCURRENCY,
  );
  let renderedPages = 0;
  let sourcePageCount = 0;
  const {
    pageCount,
    renderedSizes,
    results: ocrTexts,
  } = await dependencies.processPdfPagesWithMeta(
    bytes,
    {
      concurrency: pageConcurrency,
      maxPages: 6,
      onReady: (meta) => {
        renderedPages = meta.selectedPages;
        sourcePageCount = meta.pageCount;
        emitResumeParseProgress(options.onProgress, {
          renderedPages,
          totalPages: sourcePageCount,
          type: "document.pages.ready",
        });
      },
      scale: DEFAULT_OCR_RENDER_SCALE,
    },
    async (png, index) => {
      const pageStartedAt = nowMs();
      emitResumeParseProgress(options.onProgress, {
        page: index + 1,
        totalPages: sourcePageCount,
        type: "ocr.page.started",
      });
      const text = await qwenVlOcrWithRetry(png, index + 1, "image/png", dependencies);
      devOcrLog("page completed", {
        chars: text.length,
        duration: formatDuration(pageStartedAt),
        page: index + 1,
        pngBytes: png.byteLength,
      });
      emitResumeParseProgress(options.onProgress, {
        charCount: text.length,
        page: index + 1,
        textPreview: toOcrTextPreview(text),
        totalPages: sourcePageCount,
        type: "ocr.page.completed",
      });
      return text;
    },
  );

  if (renderedPages === 0) {
    throw new Error("Rasterization produced no pages; PDF may be empty or unreadable.");
  }

  const ocrText = ocrTexts.filter((chunk) => chunk.trim().length > 0).join("\n\n");
  if (ocrText.trim().length === 0) {
    throw new Error("Qwen OCR returned empty text for every page.");
  }
  validateOcrTextQuality(ocrText);

  const textLayer = await textLayerPromise;
  const supplement = textLayer ? buildPdfTextSupplement(ocrTexts, textLayer.pages) : null;
  const text = supplement ? `${ocrText}\n\n${supplement}` : ocrText;
  devOcrLog("ocr completed", {
    duration: formatDuration(ocrStartedAt),
    outputChars: text.length,
    pageCount,
    renderedPages,
    renderedSizes,
    supplementalChars: supplement?.length ?? 0,
  });
  emitResumeParseProgress(options.onProgress, {
    outputChars: text.length,
    renderedPages,
    totalPages: pageCount,
    type: "ocr.completed",
  });

  devOcrLog("completed", {
    duration: formatDuration(totalStartedAt),
    outputChars: text.length,
    pageCount,
    renderedPages,
  });
  return { pageCount, text, textSource: "qwen-ocr" };
}

export function extractResumeDocumentText(
  input: ResumeDocumentInput,
  dependencies: ResumeParsePipelineDependencies = defaultResumeParsePipelineDependencies,
): Promise<ParsedResumeOcr> {
  const kind = getResumeDocumentKind(input);
  if (!kind) {
    throw new Error("仅支持上传 PDF、DOC、DOCX、HTML、PPT、PPTX、XLS、XLSX、JPG、PNG 简历。");
  }

  switch (kind) {
    case "pdf": {
      return parseResumeOcrOnly(input.bytes, { onProgress: input.onProgress }, dependencies);
    }
    case "doc": {
      return dependencies
        .convertLegacyOfficeToOoxml({
          bytes: input.bytes,
          inputExtension: "doc",
          outputExtension: "docx",
        })
        .then(extractDocxText);
    }
    case "docx": {
      return extractDocxText(input.bytes);
    }
    case "html": {
      return Promise.resolve(extractHtmlText(input.bytes));
    }
    case "ppt": {
      return dependencies
        .convertLegacyOfficeToOoxml({
          bytes: input.bytes,
          inputExtension: "ppt",
          outputExtension: "pptx",
        })
        .then(extractPptxText);
    }
    case "pptx": {
      return extractPptxText(input.bytes);
    }
    case "xls": {
      return dependencies
        .convertLegacyOfficeToOoxml({
          bytes: input.bytes,
          inputExtension: "xls",
          outputExtension: "xlsx",
        })
        .then(extractXlsxText);
    }
    case "xlsx": {
      return extractXlsxText(input.bytes);
    }
    case "image": {
      return extractImageText(input, dependencies);
    }
    default: {
      throw new Error("仅支持上传 PDF、DOC、DOCX、HTML、PPT、PPTX、XLS、XLSX、JPG、PNG 简历。");
    }
  }
}

export function parseResumeDocument(
  input: ResumeDocumentInput,
  dependencies: ResumeParsePipelineDependencies = defaultResumeParsePipelineDependencies,
): Promise<ParsedResumeDocument> {
  if (!getResumeDocumentKind(input)) {
    throw new Error("仅支持上传 PDF、DOC、DOCX、HTML、PPT、PPTX、XLS、XLSX、JPG、PNG 简历。");
  }
  if (dependencies.getResumeParseProvider() === "aliyun-docmining") {
    return dependencies.parseResumeWithAliyun(input);
  }
  return extractResumeDocumentText(input, dependencies);
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
  dependencies: ResumeParsePipelineDependencies = defaultResumeParsePipelineDependencies,
): Promise<ParsedResumeFast> {
  const startedAt = nowMs();
  const documentInput =
    input instanceof Uint8Array
      ? { bytes: input, fileName: "resume.pdf", mediaType: "application/pdf" }
      : input;
  devOcrLog("full parse start", { bytes: documentInput.bytes.byteLength });
  const parsed = await parseResumeDocument(documentInput, dependencies);
  if ("structured" in parsed) {
    devOcrLog("full parse completed", {
      duration: formatDuration(startedAt),
      outputChars: parsed.text.length,
      pageCount: parsed.pageCount,
      provider: parsed.textSource,
    });
    return parsed;
  }
  devOcrLog("structured dispatch", {
    inputChars: parsed.text.length,
    pageCount: parsed.pageCount,
  });
  const structured = await generateResumeStructured(
    parsed.text,
    { fileName: documentInput.fileName },
    dependencies,
  );
  devOcrLog("full parse completed", {
    duration: formatDuration(startedAt),
    outputChars: parsed.text.length,
    pageCount: parsed.pageCount,
  });
  return { ...parsed, structured };
}

export function createResumeParsePipeline(dependencies: ResumeParsePipelineDependencies) {
  return {
    extractResumeDocumentText: (input: ResumeDocumentInput) =>
      extractResumeDocumentText(input, dependencies),
    generateResumeStructured: (text: string, options: { fileName?: string } = {}) =>
      generateResumeStructured(text, options, dependencies),
    parseResumeFast: (input: Uint8Array | ResumeDocumentInput) =>
      parseResumeFast(input, dependencies),
    parseResumeOcrOnly: (
      bytes: Uint8Array,
      options: { onProgress?: ResumeDocumentInput["onProgress"] } = {},
    ) => parseResumeOcrOnly(bytes, options, dependencies),
  };
}
