// Renders a resume's first page (PDF page or image) within Jev's image limits and crops headshots.
// 把简历首页（PDF 首页或图片本身）渲染到 Jev 允许的尺寸，并按 Jev 标注的人像区域裁剪头像。

import type * as MupdfModuleNs from "mupdf";
import type { HeadshotBox, HeadshotLocation } from "./jev-headshot";

type MupdfModule = typeof MupdfModuleNs;

// Jev accepts 256–1568 px per side and 78,400–2,458,624 total pixels; stay a little inside
// because mupdf rounds pixmap bounds outward.
const VISION_LONGEST_SIDE = 1560;
const VISION_MIN_SIDE = 256;
const VISION_MIN_PIXELS = 78_400;
const AVATAR_MAX_SIDE = 512;
const AVATAR_MIN_SIDE = 48;
const AVATAR_JPEG_QUALITY = 90;

export type FirstPageSourceMediaType = "application/pdf" | "image/jpeg" | "image/png";

export interface PixelRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface FirstPageImage {
  cropAvatarJpeg: (location: AvatarCropTarget) => Uint8Array | null;
  height: number;
  png: Uint8Array<ArrayBuffer>;
  width: number;
}

let mupdfModulePromise: Promise<MupdfModule> | null = null;

function loadMupdf(): Promise<MupdfModule> {
  mupdfModulePromise ??= import("mupdf");
  return mupdfModulePromise;
}

export function resolveVisionScale(pageWidth: number, pageHeight: number): number | null {
  if (!(pageWidth > 0 && pageHeight > 0)) {
    return null;
  }
  const scale = VISION_LONGEST_SIDE / Math.max(pageWidth, pageHeight);
  const minSide = Math.min(pageWidth, pageHeight) * scale;
  const pixels = pageWidth * pageHeight * scale * scale;
  return minSide >= VISION_MIN_SIDE && pixels >= VISION_MIN_PIXELS ? scale : null;
}

export type AvatarCropTarget = Pick<HeadshotLocation, "person" | "photo">;

// 照片框可信时，裁剪不越过照片边界；否则只限制在页面内。
// Below this confidence the photo box is not trusted as a crop boundary.
const PHOTO_BOUNDS_MIN_CONFIDENCE = 0.5;

interface PixelBounds {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function toPixelBounds(box: HeadshotBox, imageWidth: number, imageHeight: number): PixelBounds {
  return {
    bottom: Math.min(1, Math.max(box.top, box.bottom)) * imageHeight,
    left: Math.max(0, Math.min(box.left, box.right)) * imageWidth,
    right: Math.min(1, Math.max(box.left, box.right)) * imageWidth,
    top: Math.max(0, Math.min(box.top, box.bottom)) * imageHeight,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Crops exactly the person region Jev marked (head plus visible torso), clipped to the
// headshot photo so it never spills into the surrounding resume text.
// 按 Jev 标注的人像区域（头部加可见躯干）截取，并限制在证件照范围内，避免截到旁边的简历文字。
export function toAvatarCrop(
  target: AvatarCropTarget,
  imageWidth: number,
  imageHeight: number,
): PixelRect | null {
  const person = toPixelBounds(target.person.box, imageWidth, imageHeight);
  const photo = toPixelBounds(target.photo.box, imageWidth, imageHeight);
  const centerX = (person.left + person.right) / 2;
  const centerY = (person.top + person.bottom) / 2;
  const photoContainsPerson =
    centerX >= photo.left &&
    centerX <= photo.right &&
    centerY >= photo.top &&
    centerY <= photo.bottom;
  const bounds =
    target.photo.confidence >= PHOTO_BOUNDS_MIN_CONFIDENCE && photoContainsPerson
      ? photo
      : { bottom: imageHeight, left: 0, right: imageWidth, top: 0 };
  const left = Math.round(clamp(person.left, bounds.left, bounds.right));
  const right = Math.round(clamp(person.right, bounds.left, bounds.right));
  const top = Math.round(clamp(person.top, bounds.top, bounds.bottom));
  const bottom = Math.round(clamp(person.bottom, bounds.top, bounds.bottom));
  if (Math.min(right - left, bottom - top) < AVATAR_MIN_SIDE) {
    return null;
  }
  return { height: bottom - top, width: right - left, x: left, y: top };
}

function cropAvatarJpeg(
  pixmap: MupdfModuleNs.Pixmap,
  target: AvatarCropTarget,
  width: number,
  height: number,
): Uint8Array | null {
  const rect = toAvatarCrop(target, width, height);
  if (!rect) {
    return null;
  }
  // Keep the marked aspect ratio; only shrink so the longer side stays within the avatar limit.
  const outputScale = Math.min(1, AVATAR_MAX_SIDE / Math.max(rect.width, rect.height));
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  // Pixmap.warp takes the source quad clockwise: upper-left, upper-right, lower-right, lower-left.
  const avatar = pixmap.warp(
    [
      [rect.x, rect.y],
      [right, rect.y],
      [right, bottom],
      [rect.x, bottom],
    ],
    Math.round(rect.width * outputScale),
    Math.round(rect.height * outputScale),
  );
  try {
    return new Uint8Array(avatar.asJPEG(AVATAR_JPEG_QUALITY));
  } finally {
    avatar.destroy();
  }
}

// Opens the first page, renders it for vision, and keeps the pixmap alive while `use` runs
// so the same pixels can be cropped once the headshot box is known.
export async function withFirstPageImage<T>(
  source: { bytes: Uint8Array; mediaType: FirstPageSourceMediaType },
  use: (page: FirstPageImage) => Promise<T>,
): Promise<T | null> {
  const mupdf = await loadMupdf();
  const doc = mupdf.Document.openDocument(source.bytes, source.mediaType);
  try {
    if (doc.countPages() < 1) {
      return null;
    }
    const page = doc.loadPage(0);
    try {
      const [x0, y0, x1, y1] = page.getBounds();
      const scale = resolveVisionScale(x1 - x0, y1 - y0);
      if (scale === null) {
        return null;
      }
      const pixmap = page.toPixmap(
        mupdf.Matrix.scale(scale, scale),
        mupdf.ColorSpace.DeviceRGB,
        false,
      );
      try {
        const width = pixmap.getWidth();
        const height = pixmap.getHeight();
        return await use({
          cropAvatarJpeg: (target) => cropAvatarJpeg(pixmap, target, width, height),
          height,
          png: new Uint8Array(pixmap.asPNG()),
          width,
        });
      } finally {
        pixmap.destroy();
      }
    } finally {
      page.destroy();
    }
  } finally {
    doc.destroy();
  }
}
