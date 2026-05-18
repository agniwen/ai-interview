import "server-only";

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

export async function rasterizePdfWithMeta(
  bytes: Uint8Array,
  { scale = 2, maxPages = 6 }: RasterizeOptions = {},
): Promise<RasterizeResult> {
  const mupdf = await loadMupdf();
  // mupdf takes ownership of the buffer it parses; clone so callers keep
  // their own copy intact.
  const owned = new Uint8Array(bytes);
  const doc = mupdf.Document.openDocument(owned, "application/pdf");

  try {
    const pageCount = doc.countPages();
    const total = Math.min(pageCount, maxPages);
    const matrix = mupdf.Matrix.scale(scale, scale);
    const pngs: Buffer[] = [];

    for (let i = 0; i < total; i += 1) {
      const page = doc.loadPage(i);
      try {
        const pixmap = page.toPixmap(matrix, mupdf.ColorSpace.DeviceRGB, false);
        try {
          pngs.push(Buffer.from(pixmap.asPNG()));
        } finally {
          pixmap.destroy();
        }
      } finally {
        page.destroy();
      }
    }
    return { pageCount, pages: pngs };
  } finally {
    doc.destroy();
  }
}

export async function rasterizePdf(
  bytes: Uint8Array,
  options?: RasterizeOptions,
): Promise<Buffer[]> {
  const result = await rasterizePdfWithMeta(bytes, options);
  return result.pages;
}
