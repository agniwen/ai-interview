import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function resolveKey(secret = process.env.MAIL_INGEST_SECRET_KEY): Buffer {
  const value = secret?.trim();
  if (!value) {
    throw new Error("MAIL_INGEST_SECRET_KEY is not set.");
  }
  return createHash("sha256").update(value).digest();
}

export function encryptMailIngestSecret(plaintext: string, secret?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, resolveKey(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptMailIngestSecret(encryptedValue: string, secret?: string): string {
  const [version, ivValue, tagValue, payloadValue] = encryptedValue.split(":");
  if (version !== VERSION || !ivValue || !tagValue || !payloadValue) {
    throw new Error("Invalid mail ingest secret payload.");
  }
  const decipher = createDecipheriv(
    ALGORITHM,
    resolveKey(secret),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payloadValue, "base64url")),
    decipher.final(),
  ]).toString("utf-8");
}
