import { mkdtemp, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBoundedBenchmarkJson } from "./bounded-json";

describe("Meeting transcription benchmark JSON boundary", () => {
  it("rejects an oversized manifest before buffering it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-json-"));
    const path = join(directory, "manifest.json");
    await writeFile(path, "{}");
    await truncate(path, 64 * 1024 * 1024 + 1);

    await expect(readBoundedBenchmarkJson(path)).rejects.toThrow("64 MiB");
  });
});
