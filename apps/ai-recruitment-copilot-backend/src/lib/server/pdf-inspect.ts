// Inspect PDF metadata without rendering pages to images.
//
// Backed by `mupdf` (WASM): no native build, no canvas/CMap fragility, ships
// its own font + cmap data, and runs anywhere Node runs.

import type * as MupdfModuleNs from "mupdf";

type MupdfModule = typeof MupdfModuleNs;

let mupdfModulePromise: Promise<MupdfModule> | null = null;

function loadMupdf(): Promise<MupdfModule> {
  mupdfModulePromise ??= import("mupdf");
  return mupdfModulePromise;
}

export async function getPdfPageCount(bytes: Uint8Array): Promise<number> {
  const mupdf = await loadMupdf();
  const owned = new Uint8Array(bytes);
  const doc = mupdf.Document.openDocument(owned, "application/pdf");
  try {
    return doc.countPages();
  } finally {
    doc.destroy();
  }
}
