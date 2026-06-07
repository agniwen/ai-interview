// data: URL 解码测试 / decodeDataUrl tests.

import { describe, expect, it } from "vitest";
import { decodeDataUrl } from "@arc/shared/data-url";

function bytesToString(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

describe("decodeDataUrl", () => {
  it("decodes base64 payload and returns the media type", () => {
    const helloBase64 = Buffer.from("hello", "utf-8").toString("base64");
    const { data, mediaType } = decodeDataUrl(`data:text/plain;base64,${helloBase64}`);
    expect(mediaType).toBe("text/plain");
    expect(bytesToString(data)).toBe("hello");
  });

  it("decodes percent-encoded payload", () => {
    const { data, mediaType } = decodeDataUrl("data:text/plain,hello%20world");
    expect(mediaType).toBe("text/plain");
    expect(bytesToString(data)).toBe("hello world");
  });

  it("handles UTF-8 in percent-encoded payload", () => {
    const encoded = encodeURIComponent("你好，世界");
    const { data } = decodeDataUrl(`data:text/plain,${encoded}`);
    expect(bytesToString(data)).toBe("你好，世界");
  });

  it("returns undefined mediaType when the meta block is empty", () => {
    const helloBase64 = Buffer.from("x", "utf-8").toString("base64");
    const { mediaType } = decodeDataUrl(`data:;base64,${helloBase64}`);
    expect(mediaType).toBeUndefined();
  });

  it("strips ;charset / ;base64 modifiers from mediaType", () => {
    const helloBase64 = Buffer.from("x", "utf-8").toString("base64");
    const { mediaType } = decodeDataUrl(`data:application/pdf;base64,${helloBase64}`);
    expect(mediaType).toBe("application/pdf");

    const { mediaType: charsetType } = decodeDataUrl("data:text/plain;charset=utf-8,hi");
    expect(charsetType).toBe("text/plain");
  });

  it("handles empty payload", () => {
    const { data, mediaType } = decodeDataUrl("data:text/plain;base64,");
    expect(mediaType).toBe("text/plain");
    expect(data).toHaveLength(0);
  });

  it("throws on malformed input (no comma)", () => {
    expect(() => decodeDataUrl("data:text/plain;base64")).toThrow(/Invalid data URL/);
  });

  it("throws when the prefix is wrong", () => {
    expect(() => decodeDataUrl("http://example.com,abc")).toThrow(/Invalid data URL/);
  });

  it("round-trips arbitrary binary bytes via base64", () => {
    const original = new Uint8Array([0, 1, 2, 254, 255]);
    const base64 = Buffer.from(original).toString("base64");
    const { data } = decodeDataUrl(`data:application/octet-stream;base64,${base64}`);
    expect([...data]).toEqual([...original]);
  });
});
