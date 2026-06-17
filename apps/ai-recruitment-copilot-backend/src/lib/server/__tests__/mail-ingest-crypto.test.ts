import { describe, expect, it } from "vitest";
import { decryptMailIngestSecret, encryptMailIngestSecret } from "../mail-ingest-crypto";

describe("mail ingest secret crypto", () => {
  it("encrypts and decrypts mailbox passwords", () => {
    const encrypted = encryptMailIngestSecret("client-password", "test-secret");

    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain("client-password");
    expect(decryptMailIngestSecret(encrypted, "test-secret")).toBe("client-password");
  });

  it("rejects missing secret keys", () => {
    expect(() => encryptMailIngestSecret("client-password", "")).toThrow(
      "MAIL_INGEST_SECRET_KEY is not set.",
    );
  });
});
