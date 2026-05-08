// 同构 SHA-256 hex 工具：浏览器与 Node 20+ 都通过 globalThis.crypto.subtle 工作。
// Isomorphic SHA-256 hex helper backed by globalThis.crypto.subtle (browser & Node 20+).

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

export async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bufferToHex(digest);
}

export async function sha256HexOfFile(file: File | Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return bufferToHex(digest);
}

const HASH_RE = /^[0-9a-f]{64}$/;

export function isValidSha256Hex(value: unknown): value is string {
  return typeof value === "string" && HASH_RE.test(value);
}
