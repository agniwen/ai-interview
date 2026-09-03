import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireMeetingTranscriptionBenchmarkRunLock } from "./run-lock";

describe("Meeting transcription benchmark run lock", () => {
  it("permits only one paid-run writer for an output path", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-lock-"));
    const outputPath = join(directory, "report.json");
    const release = await acquireMeetingTranscriptionBenchmarkRunLock(outputPath);

    await expect(acquireMeetingTranscriptionBenchmarkRunLock(outputPath)).rejects.toThrow(
      "already running",
    );
    await release();
    const releaseAgain = await acquireMeetingTranscriptionBenchmarkRunLock(outputPath);
    await releaseAgain();
  });

  it("does not race a stale-looking lock or unlink a replaced owner", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-lock-"));
    const outputPath = join(directory, "report.json");
    await writeFile(`${outputPath}.lock`, `${JSON.stringify({ pid: 2_147_483_647 })}\n`);

    await expect(acquireMeetingTranscriptionBenchmarkRunLock(outputPath)).rejects.toThrow(
      "Remove the lock manually",
    );
    expect(await readFile(`${outputPath}.lock`, "utf-8")).toContain("2147483647");
  });

  it("publishes a complete owner token before the lock becomes visible", async () => {
    const directory = await mkdtemp(join(tmpdir(), "meeting-transcription-lock-"));
    const outputPath = join(directory, "report.json");
    const release = await acquireMeetingTranscriptionBenchmarkRunLock(outputPath);

    expect(JSON.parse(await readFile(`${outputPath}.lock`, "utf-8"))).toMatchObject({
      pid: process.pid,
      token: expect.any(String),
    });
    await release();
  });
});
