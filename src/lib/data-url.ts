/**
 * `data:` URL 解析工具。
 * Helpers for `data:` URLs.
 *
 * 支持 base64 与 percent-encoded 两种 payload 形式，兼容图片 / PDF 等场景。
 * Handles both base64 and percent-encoded payloads (works for images, PDFs, etc.).
 */

const DATA_URL_REGEX = /^data:([^,]*),([\s\S]*)$/;

/**
 * 把 `data:` URL 解码为字节数组及 MIME 类型。
 * Decode a `data:` URL into a byte array and its MIME type.
 *
 * @throws 当输入不是合法 `data:` URL 时抛出。
 *         Throws when the input is not a valid `data:` URL.
 */
export function decodeDataUrl(dataUrl: string): {
  data: Uint8Array;
  mediaType: string | undefined;
} {
  const match = dataUrl.match(DATA_URL_REGEX);

  if (!match) {
    throw new Error("Invalid data URL format.");
  }

  const meta = match[1] ?? "";
  const payload = match[2] ?? "";
  const mediaType = meta.split(";")[0]?.trim() || undefined;
  const isBase64 = meta.includes(";base64");

  if (isBase64) {
    return {
      data: Uint8Array.from(Buffer.from(payload, "base64")),
      mediaType,
    };
  }

  return {
    data: Uint8Array.from(Buffer.from(decodeURIComponent(payload), "utf-8")),
    mediaType,
  };
}
