import * as mupdf from "mupdf";
import { expect, it } from "vitest";
import { OCR_MAX_IMAGE_BYTES, OCR_MAX_PIXELS, prepareImageForOcr } from "../pdf-rasterize";

function rgbPixmap(width: number, height: number, fill: "noise" | "white"): mupdf.Pixmap {
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  if (fill === "white") {
    pixmap.clear(255);
  } else {
    const pixels = pixmap.getPixels();
    for (let index = 0; index < pixels.length; index += 1) {
      pixels[index] = Math.floor(Math.random() * 256);
    }
  }
  return pixmap;
}

function encode(pixmap: mupdf.Pixmap, format: "jpeg" | "png"): Uint8Array {
  try {
    return new Uint8Array(format === "png" ? pixmap.asPNG() : pixmap.asJPEG(90));
  } finally {
    pixmap.destroy();
  }
}

function imagePixels(bytes: Uint8Array): number {
  const image = new mupdf.Image(bytes);
  try {
    return image.getWidth() * image.getHeight();
  } finally {
    image.destroy();
  }
}

it("leaves images within the OCR limits byte-for-byte unchanged", async () => {
  const png = encode(rgbPixmap(1200, 1600, "white"), "png");

  const prepared = await prepareImageForOcr(png, "image/png");

  expect(prepared.mediaType).toBe("image/png");
  expect(prepared.image.equals(png)).toBe(true);
});

it("downscales images above the OCR pixel budget", async () => {
  const jpeg = encode(rgbPixmap(4000, 3000, "white"), "jpeg");
  expect(imagePixels(jpeg)).toBeGreaterThan(OCR_MAX_PIXELS);

  const prepared = await prepareImageForOcr(jpeg, "image/jpeg");

  expect(prepared.mediaType).toBe("image/jpeg");
  expect(imagePixels(prepared.image)).toBeLessThanOrEqual(OCR_MAX_PIXELS);
  expect(prepared.image.byteLength).toBeLessThanOrEqual(OCR_MAX_IMAGE_BYTES);
});

it("re-encodes oversized PNGs as JPEG within the OCR byte limit", async () => {
  const png = encode(rgbPixmap(2000, 2000, "noise"), "png");
  expect(png.byteLength).toBeGreaterThan(OCR_MAX_IMAGE_BYTES);

  const prepared = await prepareImageForOcr(png, "image/png");

  expect(prepared.mediaType).toBe("image/jpeg");
  expect(prepared.image.byteLength).toBeLessThanOrEqual(OCR_MAX_IMAGE_BYTES);
  expect(imagePixels(prepared.image)).toBe(2000 * 2000);
});
