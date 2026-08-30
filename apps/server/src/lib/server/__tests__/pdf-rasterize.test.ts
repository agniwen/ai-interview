import { setTimeout as delay } from "node:timers/promises";
import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { processPdfPagesWithMeta } from "../pdf-rasterize";

function createPdf(pageCount: number): Buffer {
  const document = new mupdf.PDFDocument();
  try {
    for (let index = 0; index < pageCount; index += 1) {
      const page = document.addPage([0, 0, 100, 100], 0, {}, Buffer.from("q\nQ\n"));
      document.insertPage(-1, page);
    }
    const saved = document.saveToBuffer();
    try {
      return Buffer.from(saved.asUint8Array());
    } finally {
      saved.destroy();
    }
  } finally {
    document.destroy();
  }
}

describe("processPdfPagesWithMeta", () => {
  it("processes pages through a bounded pool and preserves page order", async () => {
    const pdf = createPdf(6);
    const originalPdf = Buffer.from(pdf);
    let active = 0;
    let maxActive = 0;

    const result = await processPdfPagesWithMeta(
      pdf,
      { concurrency: 4, maxPages: 6, scale: 1 },
      async (png, index) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await delay((6 - index) * 2);
        active -= 1;
        expect(png.byteLength).toBeGreaterThan(0);
        return `page-${index + 1}`;
      },
    );

    expect(maxActive).toBe(4);
    expect(pdf).toEqual(originalPdf);
    expect(result.pageCount).toBe(6);
    expect(result.renderedSizes).toHaveLength(6);
    expect(result.results).toEqual(["page-1", "page-2", "page-3", "page-4", "page-5", "page-6"]);
  });
});
