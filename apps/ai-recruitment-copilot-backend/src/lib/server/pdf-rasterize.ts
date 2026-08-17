// Rasterize PDF pages to PNG buffers (server-side, Node.js).
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

export interface PdfPageDocument {
  destroy: () => void;
  pageCount: number;
  renderPage: (index: number) => Buffer;
}

export interface PdfPageRenderer {
  openDocument: (bytes: Uint8Array, scale: number) => Promise<PdfPageDocument>;
}

function renderPdfPage(
  mupdf: MupdfModule,
  doc: MupdfModuleNs.Document,
  matrix: MupdfModuleNs.Matrix,
  index: number,
): Buffer {
  const page = doc.loadPage(index);
  try {
    const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
    try {
      const png = pixmap.asPNG();
      return Buffer.from(png.buffer, png.byteOffset, png.byteLength);
    } finally {
      pixmap.destroy();
    }
  } finally {
    page.destroy();
  }
}

const defaultPdfPageRenderer: PdfPageRenderer = {
  openDocument: async (bytes, scale) => {
    const mupdf = await loadMupdf();
    const doc = mupdf.Document.openDocument(bytes, "application/pdf");
    const matrix = mupdf.Matrix.scale(scale, scale);
    return {
      destroy: () => doc.destroy(),
      pageCount: doc.countPages(),
      renderPage: (index) => renderPdfPage(mupdf, doc, matrix, index),
    };
  },
};

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
