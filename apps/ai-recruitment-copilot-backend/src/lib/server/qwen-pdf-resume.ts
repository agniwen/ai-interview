import { setTimeout as delay } from "node:timers/promises";
import pRetry from "p-retry";
import { getPdfPageCount } from "./pdf-inspect";
import { qwenPdfOcr } from "./qwen-ocr";

const DEFAULT_OCR_ATTEMPTS = 3;
const DEFAULT_OCR_RETRY_DELAY_MS = 1000;
const QWEN_PDF_MAX_PAGES = 50;

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

class RetriableOcrTypeError extends Error {
  readonly originalError: TypeError;

  constructor(error: TypeError) {
    super(error.message);
    this.name = "RetriableOcrTypeError";
    this.originalError = error;
  }
}

function normalizeRetryError(error: unknown): unknown {
  return error instanceof TypeError && isTransientOcrError(error)
    ? new RetriableOcrTypeError(error)
    : error;
}

function restoreRetryError(error: unknown): never {
  if (error instanceof RetriableOcrTypeError) {
    throw error.originalError;
  }
  throw error;
}

function runQwenPdfOcrWithRetry(fileUrl: string): Promise<string> {
  const attempts = parsePositiveInteger(
    process.env.RESUME_PARSE_OCR_ATTEMPTS,
    DEFAULT_OCR_ATTEMPTS,
  );
  const retryDelayMs = parseNonNegativeInteger(
    process.env.RESUME_PARSE_OCR_RETRY_DELAY_MS,
    DEFAULT_OCR_RETRY_DELAY_MS,
  );
  return pRetry(
    async () => {
      try {
        return await qwenPdfOcr(fileUrl);
      } catch (error) {
        throw normalizeRetryError(error);
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
        const delayMs = retryDelayMs * attemptNumber;
        if (delayMs > 0) {
          await delay(delayMs);
        }
      },
      retries: Math.max(0, attempts - 1),
      shouldRetry: ({ error }) => isTransientOcrError(error),
    },
  ).catch(restoreRetryError);
}

export async function parseQwenPdfResume(input: {
  bytes: Uint8Array;
  fileUrl: string;
  onProgress?: (event: QwenPdfProgressEvent) => void;
}): Promise<{ pageCount: number; text: string; textSource: "qwen3.5-ocr" }> {
  const pageCount = await getPdfPageCount(input.bytes);
  if (pageCount > QWEN_PDF_MAX_PAGES) {
    throw new Error(`Qwen3.5 OCR 最多支持 50 页 PDF，当前文件为 ${pageCount} 页。`);
  }
  input.onProgress?.({
    renderedPages: pageCount,
    totalPages: pageCount,
    type: "document.pages.ready",
  });
  const text = await runQwenPdfOcrWithRetry(input.fileUrl);
  if (text.trim().length === 0) {
    throw new Error("Qwen3.5 OCR returned empty text for the PDF resume.");
  }
  input.onProgress?.({
    outputChars: text.length,
    renderedPages: pageCount,
    totalPages: pageCount,
    type: "ocr.completed",
  });
  return { pageCount, text, textSource: "qwen3.5-ocr" };
}

type QwenPdfProgressEvent =
  | {
      renderedPages: number;
      totalPages: number;
      type: "document.pages.ready";
    }
  | {
      outputChars: number;
      renderedPages: number;
      totalPages: number;
      type: "ocr.completed";
    };
