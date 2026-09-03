import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifyLocalBenchmarkAsset, verifyRemoteBenchmarkAsset } from "./asset-verification";

describe("Meeting transcription benchmark asset verification", () => {
  it("streams and binds both local and Tingwu source bytes to one manifest digest", async () => {
    const bytes = new TextEncoder().encode("consented audio fixture");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-asset-"));
    const path = join(directory, "audio.webm");
    await writeFile(path, bytes);

    await expect(
      verifyLocalBenchmarkAsset({ expectedSha256: sha256, expectedSizeBytes: bytes.length, path }),
    ).resolves.toBeUndefined();
    await expect(
      verifyRemoteBenchmarkAsset({
        expectedSha256: sha256,
        expectedSizeBytes: bytes.length,
        fetch: vi.fn(() => Promise.resolve(new Response(bytes))),
        signal: AbortSignal.timeout(1000),
        url: "https://private.example/audio.webm",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects a swapped remote object without exposing its URL", async () => {
    await expect(
      verifyRemoteBenchmarkAsset({
        expectedSha256: "a".repeat(64),
        expectedSizeBytes: 7,
        fetch: vi.fn(() => Promise.resolve(new Response("swapped"))),
        signal: AbortSignal.timeout(1000),
        url: "https://private.example/audio.webm?Signature=secret",
      }),
    ).rejects.toThrow("does not match");
  });
});
