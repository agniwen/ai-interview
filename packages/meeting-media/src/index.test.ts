import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { mergeMeetingTranscriptionChunkResults, normalizeMeetingRecordingSegments } from "./index";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe("normalizeMeetingRecordingSegments", () => {
  it("remuxes independently restarted WebM segments into one complete source", async () => {
    const root = await mkdtemp(join(tmpdir(), "meeting-segments-"));
    roots.push(root);
    const first = join(root, "first.webm");
    const second = join(root, "second.webm");
    await Promise.all([
      execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=1",
        "-c:a",
        "libopus",
        first,
      ]),
      execFileAsync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=880:duration=1",
        "-c:a",
        "libopus",
        second,
      ]),
    ]);
    const [firstBytes, secondBytes] = await Promise.all([readFile(first), readFile(second)]);
    const source = join(root, "source.webm");
    await writeFile(source, Buffer.concat([firstBytes, secondBytes]));
    const output = join(root, "normalized.webm");

    await normalizeMeetingRecordingSegments({
      outputPath: output,
      segments: [
        { durationMs: 1000, offsetBytes: 0, sizeBytes: firstBytes.byteLength },
        { durationMs: 1000, offsetBytes: firstBytes.byteLength, sizeBytes: secondBytes.byteLength },
      ],
      sourcePath: source,
    });
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      output,
    ]);

    expect(Number.parseFloat(stdout)).toBeGreaterThan(1.9);
  });
});

describe("mergeMeetingTranscriptionChunkResults", () => {
  it("uses the candidate participant recording to label the candidate in the full dialogue", () => {
    const baseChunk = {
      contentType: "audio/webm",
      endMs: 10_000,
      filePath: "/tmp/audio.webm",
      index: 0,
      startMs: 0,
    };
    const transcript = mergeMeetingTranscriptionChunkResults([
      {
        chunk: { ...baseChunk, track: "mixed" },
        transcript: {
          language: "zh",
          turns: [
            {
              confidence: null,
              endMs: 1500,
              speakerKey: "remote-1",
              startMs: 100,
              text: "请介绍一下支付系统项目",
              track: "remote",
            },
            {
              confidence: null,
              endMs: 4200,
              speakerKey: "remote-2",
              startMs: 1700,
              text: "我负责支付系统的核心架构和稳定性治理",
              track: "remote",
            },
          ],
        },
      },
      {
        chunk: {
          ...baseChunk,
          speakerDisplayName: "候选人 · 刘夏江",
          track: "candidate",
        },
        transcript: {
          language: "zh",
          turns: [
            {
              confidence: null,
              endMs: 4200,
              speakerKey: "remote-1",
              startMs: 1700,
              text: "我负责支付系统核心架构以及稳定性治理",
              track: "remote",
            },
          ],
        },
      },
    ]);

    expect(transcript.turns).toEqual([
      expect.objectContaining({ speakerDisplayName: null, text: "请介绍一下支付系统项目" }),
      expect.objectContaining({
        speakerDisplayName: "候选人 · 刘夏江",
        text: "我负责支付系统的核心架构和稳定性治理",
      }),
    ]);
  });
});
