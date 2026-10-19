// Rasterize PDF pages to PNG (or JPEG when PNG exceeds the OCR size limit) buffers.
// Used to feed PDFs to Qwen-VL OCR (which only accepts images).
//
// Backed by `mupdf` (WASM): no native build, no canvas/CMap fragility, ships
// its own font + cmap data, runs anywhere Node runs.

import type * as MupdfModuleNs from "mupdf";

type MupdfModule = typeof MupdfModuleNs;

let mupdfModulePromise: Promise<MupdfModule> | null = null;

function loadMupdf(): Promise<MupdfModule> {
  mupdfModulePromise ??= import("mupdf");
  return mupdfModulePromise;
}

export interface RasterizeOptions {
  /** Render scale relative to PDF default (72 DPI). 2 ≈ 144 DPI. */
  scale?: number;
  maxPages?: number;
}

export interface RasterizeResult {
  /** Rendered pages, in order, capped by `maxPages`. */
  pages: Buffer[];
  /** Total page count of the source PDF (independent of `maxPages`). */
  pageCount: number;
}

export interface ProcessPdfPagesOptions extends RasterizeOptions {
  concurrency?: number;
  onReady?: (meta: { pageCount: number; selectedPages: number }) => void;
}

export interface ProcessPdfPagesResult<T> {
  pageCount: number;
  renderedSizes: number[];
  results: T[];
}

export interface PdfTextPagesResult {
  pageCount: number;
  pages: string[];
}

export interface PdfPageDocument {
  destroy: () => void;
  pageCount: number;
  renderPage: (index: number) => Buffer;
}

export interface PdfPageRenderer {
  openDocument: (bytes: Uint8Array, scale: number) => Promise<PdfPageDocument>;
}

// Qwen OCR accepts Base64 strings up to 10MB and downsamples anything above its
// default max_pixels (8192×32×32), so rendering beyond that only inflates
// requests. An A4 page at the default 4× scale (~8.02M px) stays untouched.
export const OCR_MAX_PIXELS = 8192 * 32 * 32;
// Pixel dimensions round up; keep the clamped render strictly inside the budget.
const OCR_SCALE_ROUNDING_MARGIN = 0.995;
// Raw bytes whose Base64 form (4/3 larger) stays safely under 10MB.
export const OCR_MAX_IMAGE_BYTES = 7_000_000;
const OCR_JPEG_QUALITIES = [85, 60] as const;

/** Returns the first encoding within the OCR size limit, else the smallest-effort last one. */
export function encodeWithinOcrLimit(
  encoders: readonly (() => Buffer)[],
  maxBytes = OCR_MAX_IMAGE_BYTES,
): Buffer {
  let encoded: Buffer = Buffer.alloc(0);
  for (const encode of encoders) {
    encoded = encode();
    if (encoded.byteLength <= maxBytes) {
      return encoded;
    }
  }
  return encoded;
}

const JPEG_SIGNATURE = Buffer.from("ffd8", "hex");

export function ocrImageMediaType(image: Buffer): "image/jpeg" | "image/png" {
  return image.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)
    ? "image/jpeg"
    : "image/png";
}

function toBuffer(bytes: Uint8Array): Buffer {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function renderPageWithinOcrLimit(
  mupdf: MupdfModule,
  page: MupdfModuleNs.Page,
  requestedScale: number,
  allowPng: boolean,
): Buffer {
  const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.getBounds();
  const area = (x1 - x0) * (y1 - y0);
  const scale =
    area > 0
      ? Math.min(requestedScale, Math.sqrt(OCR_MAX_PIXELS / area) * OCR_SCALE_ROUNDING_MARGIN)
      : requestedScale;
  const pixmap = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false);
  try {
    return encodeWithinOcrLimit([
      ...(allowPng ? [() => toBuffer(pixmap.asPNG())] : []),
      ...OCR_JPEG_QUALITIES.map((quality) => () => toBuffer(pixmap.asJPEG(quality))),
    ]);
  } finally {
    pixmap.destroy();
  }
}

function renderPdfPage(
  mupdf: MupdfModule,
  doc: MupdfModuleNs.Document,
  requestedScale: number,
  index: number,
): Buffer {
  const page = doc.loadPage(index);
  try {
    return renderPageWithinOcrLimit(mupdf, page, requestedScale, true);
  } finally {
    page.destroy();
  }
}

export interface OcrImage {
  image: Buffer;
  mediaType: "image/jpeg" | "image/png";
}

function readImagePixels(mupdf: MupdfModule, bytes: Uint8Array): number | null {
  try {
    const image = new mupdf.Image(bytes);
    try {
      return image.getWidth() * image.getHeight();
    } finally {
      image.destroy();
    }
  } catch {
    return null;
  }
}

/**
 * Shrinks an uploaded image resume to Qwen OCR's pixel and size limits. Images already within
 * both limits, or ones mupdf cannot decode, are returned byte-for-byte so OCR sees the original.
 */
export async function prepareImageForOcr(
  bytes: Uint8Array,
  mediaType: "image/jpeg" | "image/png",
): Promise<OcrImage> {
  const original = { image: toBuffer(bytes), mediaType };
  const mupdf = await loadMupdf();
  const nativePixels = readImagePixels(mupdf, bytes);
  if (
    nativePixels === null ||
    (nativePixels <= OCR_MAX_PIXELS && bytes.byteLength <= OCR_MAX_IMAGE_BYTES)
  ) {
    return original;
  }
  // The image document applies EXIF orientation and sizes the page from the image DPI, so
  // render at the scale that maps the page back to its native pixel count.
  const doc = mupdf.Document.openDocument(bytes, mediaType);
  try {
    const page = doc.loadPage(0);
    try {
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.getBounds();
      const area = (x1 - x0) * (y1 - y0);
      const nativeScale = area > 0 ? Math.sqrt(nativePixels / area) : 1;
      // Photos re-encoded as PNG grow far beyond the byte limit; keep JPEG sources as JPEG.
      const image = renderPageWithinOcrLimit(mupdf, page, nativeScale, mediaType === "image/png");
      return { image, mediaType: ocrImageMediaType(image) };
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}

const defaultPdfPageRenderer: PdfPageRenderer = {
  openDocument: async (bytes, scale) => {
    const mupdf = await loadMupdf();
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    return {
      destroy: () => doc.destroy(),
      pageCount: doc.countPages(),
      renderPage: (index) => renderPdfPage(mupdf, doc, scale, index),
    };
  },
};

export async function extractPdfTextPages(
  bytes: Uint8Array,
  maxPages = 6,
): Promise<PdfTextPagesResult> {
  const mupdf = await loadMupdf();
  const doc = mupdf.Document.openDocument(bytes, "application/pdf");
  try {
    const pageCount = doc.countPages();
    const pages: string[] = [];
    for (let index = 0; index < Math.min(pageCount, maxPages); index += 1) {
      const page = doc.loadPage(index);
      try {
        const structuredText = page.toStructuredText();
        try {
          pages.push(structuredText.asText());
        } finally {
          structuredText.destroy();
        }
      } finally {
        page.destroy();
      }
    }
    return { pageCount, pages };
  } finally {
    doc.destroy();
  }
}

export async function processPdfPagesWithMeta<T>(
  bytes: Uint8Array,
  { concurrency = 1, maxPages = 6, onReady, scale = 2 }: ProcessPdfPagesOptions,
  processPage: (png: Buffer, index: number) => Promise<T>,
  renderer: PdfPageRenderer = defaultPdfPageRenderer,
): Promise<ProcessPdfPagesResult<T>> {
  const doc = await renderer.openDocument(bytes, scale);

  try {
    const { pageCount } = doc;
    const total = Math.min(pageCount, maxPages);
    const renderedSizes = Array.from<number>({ length: total });
    const results = Array.from<T>({ length: total });
    const requestedConcurrency =
      Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : 1;
    const workerCount = Math.min(total, requestedConcurrency);
    let nextPage = 0;
    let stopped = false;

    onReady?.({ pageCount, selectedPages: total });

    const workers = Array.from({ length: workerCount }, async () => {
      while (!stopped) {
        const index = nextPage;
        if (index >= total) {
          return;
        }
        nextPage += 1;

        try {
          const png = doc.renderPage(index);
          renderedSizes[index] = png.byteLength;
          results[index] = await processPage(png, index);
        } catch (error) {
          stopped = true;
          throw error;
        }
      }
    });
    const settlements = await Promise.allSettled(workers);
    const failed = settlements.find(
      (settlement): settlement is PromiseRejectedResult => settlement.status === "rejected",
    );
    if (failed) {
      throw failed.reason;
    }

    return { pageCount, renderedSizes, results };
  } finally {
    doc.destroy();
  }
}

export async function rasterizePdfWithMeta(
  bytes: Uint8Array,
  { scale = 2, maxPages = 6 }: RasterizeOptions = {},
): Promise<RasterizeResult> {
  const { pageCount, results } = await processPdfPagesWithMeta(
    bytes,
    { concurrency: 1, maxPages, scale },
    (png) => Promise.resolve(png),
  );
  return { pageCount, pages: results };
}

export async function rasterizePdf(
  bytes: Uint8Array,
  options?: RasterizeOptions,
): Promise<Buffer[]> {
  const result = await rasterizePdfWithMeta(bytes, options);
  return result.pages;
}
