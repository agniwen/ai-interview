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

function fallbackTurn(text: string, startMs: number) {
  return {
    confidence: null,
    endMs: startMs + 1000,
    speakerKey: "remote-1",
    startMs,
    text,
    track: "remote" as const,
  };
}

describe("mergeMeetingTranscriptionChunkResults", () => {
  it("does not deduplicate overlapping speakers within the same room source", () => {
    const result = mergeMeetingTranscriptionChunkResults([
      {
        chunk: {
          contentType: "audio/webm",
          endMs: 5000,
          filePath: "/tmp/room.webm",
          index: 0,
          startMs: 0,
          track: "mixed",
        },
        transcript: {
          language: "zh",
          turns: [
            fallbackTurn("你好", 1000),
            { ...fallbackTurn("你好", 1000), speakerKey: "remote-2" },
          ],
        },
      },
    ]);
    expect(result.turns).toHaveLength(2);
  });

  it("merges overlapping room attempts once and preserves distinct fallback speech with its source", () => {
    const result = mergeMeetingTranscriptionChunkResults(
      [
        {
          chunk: {
            contentType: "audio/webm",
            endMs: 5000,
            filePath: "/tmp/room-1.webm",
            index: 0,
            recordingIdentity: {
              offsetMs: 0,
              participantIdentity: null,
              role: "unknown",
              sourceId: "room-1",
            },
            startMs: 0,
            track: "mixed",
          },
          transcript: { language: "zh", turns: [fallbackTurn("请介绍项目", 1000)] },
        },
        {
          chunk: {
            contentType: "audio/webm",
            endMs: 5000,
            filePath: "/tmp/room-2.webm",
            index: 0,
            recordingIdentity: {
              offsetMs: 0,
              participantIdentity: null,
              role: "unknown",
              sourceId: "room-2",
            },
            startMs: 0,
            track: "participant-room-2",
          },
          transcript: {
            language: "zh",
            turns: [fallbackTurn("请介绍项目", 1000), fallbackTurn("第二个问题", 3000)],
          },
        },
      ],
      [{ endMs: 4500, sourceId: "candidate-1", startMs: 2500 }],
    );
    expect(
      result.turns.map((item) => [item.text, item.attribution?.sourceId, item.attribution?.method]),
    ).toEqual([
      ["请介绍项目", "room-1", "unconfirmed"],
      ["第二个问题", "room-2", "candidate-excluded"],
    ]);
    expect(result.turns[0]?.speakerKey).not.toBe(result.turns[1]?.speakerKey);
  });
  it.each([true, false])(
    "excludes candidate only with verified silence covering the whole utterance (proof=%s)",
    (hasProof) => {
      const chunk = {
        contentType: "audio/webm",
        endMs: 5000,
        filePath: "/tmp/mixed.webm",
        index: 0,
        startMs: 0,
        track: "mixed" as const,
      };
      const result = mergeMeetingTranscriptionChunkResults(
        [
          {
            chunk,
            transcript: {
              language: "zh",
              turns: [
                {
                  confidence: null,
                  endMs: 2000,
                  speakerKey: "remote-1",
                  startMs: 1000,
                  text: "请说明技术细节",
                  track: "remote",
                },
              ],
            },
          },
        ],
        hasProof ? [{ endMs: 3000, sourceId: "candidate-file", startMs: 0 }] : [],
      );
      expect(result.turns[0]?.attribution).toMatchObject({
        method: hasProof ? "candidate-excluded" : "unconfirmed",
        role: hasProof ? "interviewer" : "unknown",
      });
      expect(result.turns[0]?.speakerDisplayName).toBe(hasProof ? "面试官" : "待确认");
    },
  );
  it("does not exclude candidate across recording gaps or partial silence", () => {
    const result = mergeMeetingTranscriptionChunkResults(
      [
        {
          chunk: {
            contentType: "audio/webm",
            endMs: 5000,
            filePath: "/tmp/mixed.webm",
            index: 0,
            startMs: 0,
            track: "mixed",
          },
          transcript: {
            language: "zh",
            turns: [
              {
                confidence: null,
                endMs: 2000,
                speakerKey: "remote-1",
                startMs: 1000,
                text: "不确定",
                track: "remote",
              },
            ],
          },
        },
      ],
      [{ endMs: 1500, sourceId: "candidate-file", startMs: 0 }],
    );
    expect(result.turns[0]?.attribution?.role).toBe("unknown");
  });
  it("preserves source roles across multiple interviewer tracks and reconnects", () => {
    const result = mergeMeetingTranscriptionChunkResults(
      [
        { id: "a", role: "interviewer" as const, text: "请介绍项目", time: 100 },
        { id: "b", role: "candidate" as const, text: "我负责播放器", time: 110 },
        { id: "c", role: "interviewer" as const, text: "具体做了什么", time: 200 },
      ].map((item) => ({
        chunk: {
          contentType: "audio/webm",
          endMs: 1000,
          filePath: "/tmp/test.webm",
          index: 0,
          recordingIdentity: {
            offsetMs: 0,
            participantIdentity: item.id,
            role: item.role,
            sourceId: item.id,
          },
          startMs: 0,
          track: `participant-${item.id}` as const,
        },
        transcript: {
          language: "zh",
          turns: [
            {
              confidence: null,
              endMs: item.time + 100,
              speakerKey: "remote-1",
              startMs: item.time,
              text: item.text,
              track: "remote" as const,
            },
          ],
        },
      })),
    );
    expect(
      result.turns.map((turn) => [turn.text, turn.attribution?.role, turn.attribution?.method]),
    ).toEqual([
      ["请介绍项目", "interviewer", "track"],
      ["我负责播放器", "candidate", "track"],
      ["具体做了什么", "interviewer", "track"],
    ]);
  });
  it("keeps a collapsed mixed speaker unconfirmed and uses the candidate recording as evidence", () => {
    const chunk = {
      contentType: "audio/webm",
      endMs: 130_000,
      filePath: "/tmp/replay.webm",
      index: 0,
      startMs: 0,
    };
    // oxlint-disable-next-line unicorn/consistent-function-scoping -- this fixture describes the collapsed-speaker regression only.
    const turn = (text: string, startMs: number, endMs: number) => ({
      confidence: null,
      endMs,
      speakerKey: "remote-1",
      startMs,
      text,
      track: "remote" as const,
    });
    const result = mergeMeetingTranscriptionChunkResults([
      {
        chunk: { ...chunk, track: "mixed" },
        transcript: {
          language: "zh",
          turns: [
            turn("模型大概有几万，量级一般在几 G 左右。", 89_500, 95_100),
            turn("那你们是怎么解决在本地加载的问题呢？", 105_300, 108_900),
            turn("这是另外一个同事解决的。", 117_700, 120_600),
          ],
        },
      },
      {
        chunk: { ...chunk, speakerDisplayName: "候选人 · 测试候选人", track: "candidate" },
        transcript: {
          language: "zh",
          turns: [
            turn("模型大概有几万，量级一般在几 G 左右。", 89_490, 95_170),
            turn("这是另外一个同事解决的。", 117_690, 120_570),
          ],
        },
      },
    ]);
    expect(result.turns).toEqual([
      expect.objectContaining({ speakerDisplayName: "候选人 · 测试候选人", startMs: 89_490 }),
      expect.objectContaining({
        speakerDisplayName: "待确认",
        text: "那你们是怎么解决在本地加载的问题呢？",
      }),
      expect.objectContaining({ speakerDisplayName: "候选人 · 测试候选人", startMs: 117_690 }),
    ]);
  });
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
      expect.objectContaining({ speakerDisplayName: "待确认", text: "请介绍一下支付系统项目" }),
      expect.objectContaining({
        speakerDisplayName: "待确认",
        text: "我负责支付系统的核心架构和稳定性治理",
      }),
      expect.objectContaining({
        speakerDisplayName: "候选人 · 刘夏江",
        text: "我负责支付系统核心架构以及稳定性治理",
      }),
    ]);
  });
});
