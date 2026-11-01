import { describe, expect, it } from "vitest";
import { isValidSha256Hex, sha256HexOfBytes, sha256HexOfFile } from "@app/shared/file-hash";

describe("sha256Hex helpers", () => {
  // Known SHA-256 of the empty string
  const EMPTY_HASH = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  // Known SHA-256 of UTF-8 "hello"
  const HELLO_HASH = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  it("sha256HexOfBytes: empty input matches RFC vector", async () => {
    const hex = await sha256HexOfBytes(new Uint8Array());
    expect(hex).toBe(EMPTY_HASH);
  });

  it("sha256HexOfBytes: 'hello' matches RFC vector", async () => {
    const hex = await sha256HexOfBytes(new TextEncoder().encode("hello"));
    expect(hex).toBe(HELLO_HASH);
  });

  it("sha256HexOfFile: matches sha256HexOfBytes on the same content", async () => {
    const file = new File([new TextEncoder().encode("hello")], "hello.txt", {
      type: "text/plain",
    });
    const hex = await sha256HexOfFile(file);
    expect(hex).toBe(HELLO_HASH);
  });

  it("sha256HexOfBytes: returns 64-char lowercase hex", async () => {
    const hex = await sha256HexOfBytes(new TextEncoder().encode("any"));
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("isValidSha256Hex", () => {
  it("accepts a valid 64-char lowercase hex", () => {
    expect(isValidSha256Hex("a".repeat(64))).toBe(true);
  });
  it("rejects uppercase hex", () => {
    expect(isValidSha256Hex("A".repeat(64))).toBe(false);
  });
  it("rejects wrong length", () => {
    expect(isValidSha256Hex("a".repeat(63))).toBe(false);
  });
  it("rejects non-string", () => {
    expect(isValidSha256Hex(null)).toBe(false);
  });
});
