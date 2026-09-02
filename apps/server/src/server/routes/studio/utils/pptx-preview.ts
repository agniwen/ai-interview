import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getResumeDocumentKind } from "@app/shared/resume-documents";

type RunCommand = (
  command: string,
  args: string[],
  options: { timeoutMs: number },
) => Promise<void>;

export interface ConvertPptxToPdfOptions {
  runCommand?: RunCommand;
  sofficeCommand?: string;
  tempDirFactory?: () => Promise<string>;
  timeoutMs?: number;
}

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT_MS = 30_000;
const PPTX_PREVIEW_CACHE_LIMIT = 20;
const pptxPreviewPdfCache = new Map<string, Uint8Array>();

async function defaultRunCommand(command: string, args: string[], options: { timeoutMs: number }) {
  await execFileAsync(command, args, {
    maxBuffer: 1024 * 1024,
    timeout: options.timeoutMs,
  });
}

export async function convertPptxToPdf(
  bytes: Uint8Array,
  {
    runCommand = defaultRunCommand,
    sofficeCommand = process.env.LIBREOFFICE_BIN?.trim() || "soffice",
    tempDirFactory = () => mkdtemp(path.join(tmpdir(), "arc-pptx-preview-")),
    timeoutMs = DEFAULT_TIMEOUT_MS,
  }: ConvertPptxToPdfOptions = {},
): Promise<Uint8Array> {
  const tempDir = await tempDirFactory();
  const inputPath = path.join(tempDir, "document.pptx");
  const outputPath = path.join(tempDir, "document.pdf");

  try {
    await writeFile(inputPath, bytes);
    await runCommand(
      sofficeCommand,
      ["--headless", "--convert-to", "pdf:impress_pdf_Export", "--outdir", tempDir, inputPath],
      { timeoutMs },
    );

    return new Uint8Array(await readFile(outputPath));
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

function setCachedPreview(cacheKey: string, pdfBytes: Uint8Array) {
  if (pptxPreviewPdfCache.has(cacheKey)) {
    pptxPreviewPdfCache.delete(cacheKey);
  }
  pptxPreviewPdfCache.set(cacheKey, pdfBytes);

  if (pptxPreviewPdfCache.size > PPTX_PREVIEW_CACHE_LIMIT) {
    const oldestKey = pptxPreviewPdfCache.keys().next().value;
    if (oldestKey) {
      pptxPreviewPdfCache.delete(oldestKey);
    }
  }
}

function getCachedPreview(cacheKey: string) {
  const value = pptxPreviewPdfCache.get(cacheKey);
  if (!value) {
    return null;
  }

  pptxPreviewPdfCache.delete(cacheKey);
  pptxPreviewPdfCache.set(cacheKey, value);
  return value;
}

export function getPptxPreviewPdfFileName(fileName: string | null | undefined) {
  const trimmed = fileName?.trim();
  if (!trimmed) {
    return "resume-preview.pdf";
  }

  return trimmed.toLowerCase().endsWith(".pptx")
    ? trimmed.replace(/\.pptx$/i, ".pdf")
    : `${trimmed}.pdf`;
}

export async function createPptxPreviewPdfResponse({
  bytes,
  cacheKey,
  fileName,
  mediaType,
}: {
  bytes: Uint8Array;
  cacheKey: string;
  fileName: string | null | undefined;
  mediaType: string | null | undefined;
}) {
  const kind = getResumeDocumentKind({
    fileName: fileName ?? undefined,
    mediaType: mediaType ?? undefined,
  });

  if (kind !== "pptx") {
    return Response.json({ error: "仅支持 PPTX 文件预览。" }, { status: 415 });
  }

  try {
    const cached = getCachedPreview(cacheKey);
    const pdfBytes = cached ?? (await convertPptxToPdf(bytes));
    if (!cached) {
      setCachedPreview(cacheKey, pdfBytes);
    }
    const filename = getPptxPreviewPdfFileName(fileName);
    const responseBody = new ArrayBuffer(pdfBytes.byteLength);
    new Uint8Array(responseBody).set(pdfBytes);

    return new Response(responseBody, {
      headers: {
        "Cache-Control": "private, max-age=300",
        "Content-Disposition": `inline; filename="${encodeURIComponent(filename)}"`,
        "Content-Length": String(pdfBytes.byteLength),
        "Content-Type": "application/pdf",
      },
    });
  } catch (error) {
    console.error("[pptx-preview] failed to convert PPTX:", error);
    return Response.json({ error: "PPTX 预览生成失败。" }, { status: 500 });
  }
}
