import type { ArcMessage } from "@arc/shared/ai-message";
import { getArcFileName, getArcFileUrl, isArcFilePart } from "@arc/shared/ai-message";
import { decodeDataUrl } from "@arc/shared/data-url";
import { isSupportedResumeDocumentInput } from "@arc/shared/resume-documents";

// ---------------------------------------------------------------------------
// Resume document helpers used across the chat / screening pipelines.
//
// Text extraction now runs exclusively through Qwen-VL OCR (see
// `src/lib/resume-parse-pipeline.ts`). This module no longer depends on
// pdf-parse / pdfjs-dist; it just exposes byte loading, attachment-message
// scanning, and helpers shared with the screening tools.
// ---------------------------------------------------------------------------

export interface UploadedResumePdf {
  id: string;
  filename: string;
  mediaType: string;
  url: string;
}

export interface ParsedResumePdf {
  filename: string;
  id: string;
  pageCount: number;
  text: string;
  totalTextChars: number;
}

export interface ClippedResumeText {
  text: string;
  truncated: boolean;
}

const LEADING_INDEX_PREFIX_REGEX = /^\s*(\d+)\s*[.．、)]\s*/;

const toDefaultFilename = (index: number): string => `resume-${index + 1}`;

export async function readPdfBytes(url: string): Promise<Uint8Array> {
  if (url.startsWith("data:")) {
    return decodeDataUrl(url).data;
  }

  if (url.startsWith("https://") || url.startsWith("http://")) {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to download resume document: ${response.status}`);
    }

    const bytes = await response.arrayBuffer();
    return new Uint8Array(bytes);
  }

  throw new Error("Unsupported resume document url format.");
}

export function clipResumeText(text: string, maxChars = 12_000): ClippedResumeText {
  if (text.length <= maxChars) {
    return { text, truncated: false };
  }
  return {
    text: `${text.slice(0, maxChars)}\n\n[...content truncated...]`,
    truncated: true,
  };
}

export function collectUploadedResumePdfs(messages: ArcMessage[]): UploadedResumePdf[] {
  const results: UploadedResumePdf[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (message.role !== "user") {
      continue;
    }

    for (const [index, part] of message.parts.entries()) {
      if (!isArcFilePart(part)) {
        continue;
      }

      const filename = getArcFileName(part) || toDefaultFilename(results.length);
      const url = getArcFileUrl(part);

      if (
        !url ||
        !isSupportedResumeDocumentInput({
          fileName: filename,
          mediaType: part.mediaType,
        })
      ) {
        continue;
      }

      const dedupeKey = `${filename}|${url}`;

      if (seen.has(dedupeKey)) {
        continue;
      }

      seen.add(dedupeKey);
      results.push({
        filename,
        id: `${message.id}-file-${index}`,
        mediaType: part.mediaType,
        url,
      });
    }
  }

  return results;
}

export function selectUploadedResumePdfs<T extends { filename: string }>(
  files: T[],
  resumeName?: string,
): T[] {
  const selector = resumeName?.trim();

  if (!selector) {
    return files;
  }

  const prefixMatch = selector.match(LEADING_INDEX_PREFIX_REGEX);
  if (prefixMatch) {
    const prefixedIndex = Number(prefixMatch[1]);
    if (Number.isInteger(prefixedIndex) && prefixedIndex >= 1 && prefixedIndex <= files.length) {
      return [files[prefixedIndex - 1]];
    }
  }

  const index = Number(selector);
  if (Number.isInteger(index) && index >= 1 && index <= files.length) {
    return [files[index - 1]];
  }

  const bareSelector = (prefixMatch ? selector.slice(prefixMatch[0].length) : selector)
    .trim()
    .toLowerCase();
  if (!bareSelector) {
    return [];
  }

  return files.filter((file) => {
    const lowerFilename = file.filename.toLowerCase();
    return lowerFilename.includes(bareSelector) || bareSelector.includes(lowerFilename);
  });
}
