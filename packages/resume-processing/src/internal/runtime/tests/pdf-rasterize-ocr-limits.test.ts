import * as mupdf from "mupdf";
import { expect, it, vi } from "vitest";
import {
  encodeWithinOcrLimit,
  OCR_MAX_PIXELS,
  ocrImageMediaType,
  processPdfPagesWithMeta,
} from "../pdf-rasterize";

// mupdf renders multi-megapixel images here; under parallel workspace test runs this
// has exceeded vitest's 5s default although it passes quickly when run alone.
vi.setConfig({ testTimeout: 30_000 });

function pdfWithPage(widthPt: number, heightPt: number): Uint8Array {
  const doc = new mupdf.PDFDocument();
  doc.insertPage(-1, doc.addPage([0, 0, widthPt, heightPt], 0, {}, ""));
  return doc.saveToBuffer("").asUint8Array();
}

function pngSize(png: Buffer) {
  return { height: png.readUInt32BE(20), width: png.readUInt32BE(16) };
}

async function renderFirstPage(bytes: Uint8Array) {
  const { results } = await processPdfPagesWithMeta(bytes, { maxPages: 1, scale: 4 }, (image) =>
    Promise.resolve(image),
  );
  const [image] = results;
  if (!image) {
    throw new Error("expected one rendered page");
  }
  return image;
}

it("keeps oversized pages within the OCR pixel budget", async () => {
  const image = await renderFirstPage(pdfWithPage(3000, 3000));
  const { width, height } = pngSize(image);

  expect(width * height).toBeLessThanOrEqual(OCR_MAX_PIXELS);
  expect(width).toBe(height);
});

it("renders ordinary A4 resumes at the requested scale", async () => {
  expect(pngSize(await renderFirstPage(pdfWithPage(595, 842)))).toEqual({
    height: 3368,
    width: 2380,
  });
});

it("falls back to the next encoding only when an image exceeds the OCR size limit", () => {
  const jpeg = vi.fn(() => Buffer.from("ffd8ff00", "hex"));
  const fits = encodeWithinOcrLimit([() => Buffer.alloc(8), jpeg], 10);
  expect(fits.byteLength).toBe(8);
  expect(jpeg).not.toHaveBeenCalled();

  const fallback = encodeWithinOcrLimit([() => Buffer.alloc(20), jpeg], 10);
  expect(ocrImageMediaType(fallback)).toBe("image/jpeg");
});

it("labels rendered pages with their actual image type", () => {
  expect(ocrImageMediaType(Buffer.from("89504e47", "hex"))).toBe("image/png");
  expect(ocrImageMediaType(Buffer.from("ffd8ffe0", "hex"))).toBe("image/jpeg");
});
