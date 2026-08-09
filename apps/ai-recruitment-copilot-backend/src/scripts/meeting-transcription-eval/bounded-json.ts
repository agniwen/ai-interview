import { readFile, stat } from "node:fs/promises";

const MAX_BENCHMARK_JSON_BYTES = 64 * 1024 * 1024;

export async function readBoundedBenchmarkJson(path: string): Promise<unknown> {
  const details = await stat(path);
  if (details.size > MAX_BENCHMARK_JSON_BYTES) {
    throw new Error(`Benchmark JSON exceeds the 64 MiB input limit: ${path}`);
  }
  return JSON.parse(await readFile(path, "utf-8"));
}
