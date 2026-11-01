import * as mupdf from "mupdf";
import { describe, expect, it } from "vitest";
import { resolveVisionScale, toAvatarCrop, withFirstPageImage } from "../first-page-image";

const QUADRANT_COLORS = {
  bottomLeft: [0, 0, 255],
  bottomRight: [255, 255, 255],
  topLeft: [255, 0, 0],
  topRight: [0, 255, 0],
} as const;

// Builds a 600×800 PNG whose four quadrants have distinct colours.
function createQuadrantPng(): Uint8Array {
  const width = 600;
  const height = 800;
  const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, width, height], false);
  try {
    const pixels = pixmap.getPixels();
    const stride = pixmap.getStride();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const isTop = y < height / 2;
        const isLeft = x < width / 2;
        let color: readonly number[] = QUADRANT_COLORS.bottomRight;
        if (isTop && isLeft) {
          color = QUADRANT_COLORS.topLeft;
        } else if (isTop) {
          color = QUADRANT_COLORS.topRight;
        } else if (isLeft) {
          color = QUADRANT_COLORS.bottomLeft;
        }
        pixels.set(color, y * stride + x * 3);
      }
    }
    return new Uint8Array(pixmap.asPNG());
  } finally {
    pixmap.destroy();
  }
}

function decodeJpeg(jpeg: Uint8Array) {
  const image = new mupdf.Image(jpeg);
  const pixmap = image.toPixmap();
  try {
    const width = pixmap.getWidth();
    const height = pixmap.getHeight();
    const channels = pixmap.getNumberOfComponents();
    const stride = pixmap.getStride();
    const pixels = pixmap.getPixels();
    const colorAt = (x: number, y: number) => {
      const offset = y * stride + x * channels;
      return [pixels[offset] ?? 0, pixels[offset + 1] ?? 0, pixels[offset + 2] ?? 0];
    };
    const inset = Math.floor(width / 8);
    return {
      corners: {
        bottomLeft: colorAt(inset, height - 1 - inset),
        bottomRight: colorAt(width - 1 - inset, height - 1 - inset),
        topLeft: colorAt(inset, inset),
        topRight: colorAt(width - 1 - inset, inset),
      },
      height,
      width,
    };
  } finally {
    pixmap.destroy();
    image.destroy();
  }
}

function expectColor(actual: number[], expected: readonly number[]) {
  for (const [index, channel] of expected.entries()) {
    expect(Math.abs((actual[index] ?? 0) - channel)).toBeLessThan(60);
  }
}

const FULL_PAGE_BOX = { bottom: 1, left: 0, right: 1, top: 0 };

function cropTarget(
  person: { bottom: number; left: number; right: number; top: number },
  photo = FULL_PAGE_BOX,
  photoConfidence = 0.9,
) {
  return {
    person: { box: person, confidence: 0.9 },
    photo: { box: photo, confidence: photoConfidence },
  };
}

describe("toAvatarCrop", () => {
  it("crops exactly the person region the model marked, keeping its aspect ratio", () => {
    expect(
      toAvatarCrop(cropTarget({ bottom: 0.5, left: 0.2, right: 0.4, top: 0.2 }), 1000, 1000),
    ).toEqual({ height: 300, width: 200, x: 200, y: 200 });
  });

  it("clips the person region to the headshot photo so resume text is never included", () => {
    expect(
      toAvatarCrop(
        cropTarget(
          { bottom: 0.45, left: 0.08, right: 0.32, top: 0.15 },
          { bottom: 0.42, left: 0.1, right: 0.3, top: 0.1 },
        ),
        1000,
        1000,
      ),
    ).toEqual({ height: 270, width: 200, x: 100, y: 150 });
  });

  it("ignores an untrusted photo box and only clips to the page", () => {
    expect(
      toAvatarCrop(
        cropTarget(
          { bottom: 0.5, left: 0.2, right: 0.4, top: 0.2 },
          { bottom: 0.3, left: 0.2, right: 0.3, top: 0.2 },
          0.2,
        ),
        1000,
        1000,
      ),
    ).toEqual({ height: 300, width: 200, x: 200, y: 200 });
  });

  it("rejects people too small to be a usable avatar", () => {
    expect(
      toAvatarCrop(cropTarget({ bottom: 0.03, left: 0, right: 0.03, top: 0 }), 1000, 1000),
    ).toBeNull();
  });
});

describe("resolveVisionScale", () => {
  it("fits an A4 page inside the vision longest-side limit", () => {
    const scale = resolveVisionScale(595, 842);
    expect(scale).not.toBeNull();
    expect(842 * (scale ?? 0)).toBeLessThanOrEqual(1568);
  });

  it("rejects pages whose short side would fall under the vision minimum", () => {
    expect(resolveVisionScale(100, 2000)).toBeNull();
  });
});

describe("withFirstPageImage", () => {
  it("renders an image resume within limits and crops the marked region without distortion", async () => {
    const jpeg = await withFirstPageImage(
      { bytes: createQuadrantPng(), mediaType: "image/png" },
      (page) => {
        expect(Math.max(page.width, page.height)).toBeLessThanOrEqual(1568);
        expect(Math.min(page.width, page.height)).toBeGreaterThanOrEqual(256);
        // A square straddling the centre: each output corner must keep its source quadrant.
        return Promise.resolve(
          page.cropAvatarJpeg(cropTarget({ bottom: 0.7, left: 0.25, right: 0.75, top: 0.3 })),
        );
      },
    );

    const decoded = decodeJpeg(jpeg ?? new Uint8Array());
    // The marked box is 0.5 × 0.4 of a 600×800 page: a 300×320 region keeps that aspect ratio.
    expect(decoded.width / decoded.height).toBeCloseTo(300 / 320, 1);
    expectColor(decoded.corners.topLeft, QUADRANT_COLORS.topLeft);
    expectColor(decoded.corners.topRight, QUADRANT_COLORS.topRight);
    expectColor(decoded.corners.bottomLeft, QUADRANT_COLORS.bottomLeft);
    expectColor(decoded.corners.bottomRight, QUADRANT_COLORS.bottomRight);
  });
});
