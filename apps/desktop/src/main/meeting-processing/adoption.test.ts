import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadVerifiedEchoSource } from "./adoption";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "echo-adopt-"));
  roots.push(root);
  const bytes = new TextEncoder().encode("original meeting bytes");
  return {
    allowedOrigin: "https://recordings.example",
    bytes,
    filePath: join(root, "source.webm"),
    signal: new AbortController().signal,
    source: {
      contentType: "audio/webm",
      durationMs: 1000,
      fragmentCount: 1,
      segments: null,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.length,
      track: "system" as const,
      url: "https://recordings.example/source",
    },
  };
}
describe("historical Echo source adoption", () => {
  it("publishes only verified complete bytes and permits a fresh download after a truncated response", async () => {
    const f = await fixture();
    await expect(
      downloadVerifiedEchoSource({
        ...f,
        fetcher: vi.fn().mockResolvedValue(new Response(f.bytes.slice(0, 4))),
      }),
    ).rejects.toThrow("完整性");
    await expect(stat(f.filePath)).rejects.toThrow();
    await expect(stat(`${f.filePath}.partial`)).rejects.toThrow();
    await downloadVerifiedEchoSource({
      ...f,
      fetcher: vi.fn().mockResolvedValue(new Response(f.bytes)),
    });
    expect(await readFile(f.filePath)).toEqual(Buffer.from(f.bytes));
  });
  it("rejects equal-length corrupted bytes and untrusted storage origins", async () => {
    const f = await fixture();
    const corrupt = Uint8Array.from(f.bytes);
    corrupt[0] = 0;
    await expect(
      downloadVerifiedEchoSource({
        ...f,
        fetcher: vi.fn().mockResolvedValue(new Response(corrupt)),
      }),
    ).rejects.toThrow("完整性");
    const fetcher = vi.fn();
    await expect(
      downloadVerifiedEchoSource({ ...f, allowedOrigin: "https://another.example", fetcher }),
    ).rejects.toThrow("不受信任");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never publishes a download interrupted by shutdown", async () => {
    const f = await fixture();
    const controller = new AbortController();
    controller.abort();
    await expect(
      downloadVerifiedEchoSource({
        ...f,
        fetcher: vi.fn().mockResolvedValue(new Response(f.bytes)),
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    await expect(stat(f.filePath)).rejects.toThrow();
  });
});
