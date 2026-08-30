import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

async function digestChunks(chunks: AsyncIterable<Uint8Array>): Promise<{
  bytes: number;
  sha256: string;
}> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of chunks) {
    bytes += chunk.byteLength;
    hash.update(chunk);
  }
  return { bytes, sha256: hash.digest("hex") };
}

export async function inspectLocalBenchmarkAsset(path: string): Promise<{
  bytes: number;
  sha256: string;
}> {
  const metadata = await stat(path);
  if (!metadata.isFile()) {
    throw new Error("Benchmark audio path is not a file");
  }
  const digest = await digestChunks(createReadStream(path));
  if (digest.bytes !== metadata.size) {
    throw new Error("Benchmark audio changed while it was being verified");
  }
  return digest;
}

export async function verifyLocalBenchmarkAsset(input: {
  expectedSha256: string;
  expectedSizeBytes: number;
  path: string;
}): Promise<void> {
  const digest = await inspectLocalBenchmarkAsset(input.path);
  if (digest.bytes !== input.expectedSizeBytes) {
    throw new Error("Benchmark audio size does not match its manifest");
  }
  if (digest.sha256 !== input.expectedSha256.toLowerCase()) {
    throw new Error("Benchmark audio hash does not match its manifest");
  }
}

export async function verifyRemoteBenchmarkAsset(input: {
  expectedSha256: string;
  expectedSizeBytes: number;
  fetch?: typeof globalThis.fetch;
  signal: AbortSignal;
  url: string;
}): Promise<void> {
  const response = await (input.fetch ?? globalThis.fetch)(input.url, { signal: input.signal });
  if (!(response.ok && response.body)) {
    throw new Error("Tingwu source object could not be verified");
  }
  const digest = await digestChunks(response.body);
  if (
    digest.bytes !== input.expectedSizeBytes ||
    digest.sha256 !== input.expectedSha256.toLowerCase()
  ) {
    throw new Error("Tingwu source object does not match the consented benchmark asset");
  }
}
