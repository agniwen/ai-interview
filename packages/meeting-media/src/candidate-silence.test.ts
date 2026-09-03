import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { candidateExclusionRanges, detectCandidateSilence } from "./candidate-silence";

describe("candidate exclusion evidence", () => {
  it("recognizes digital silence but not audible audio in verified files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "candidate-silence-test-"));
    try {
      const silent = join(directory, "silent.ogg");
      const audible = join(directory, "audible.ogg");
      for (const [file, source] of [
        [silent, "anullsrc=r=48000:cl=mono"],
        [audible, "sine=frequency=440:sample_rate=48000"],
      ]) {
        await promisify(execFile)("ffmpeg", [
          "-nostdin",
          "-hide_banner",
          "-loglevel",
          "error",
          "-f",
          "lavfi",
          "-i",
          source,
          "-t",
          "2",
          "-c:a",
          "libopus",
          file,
        ]);
      }
      const silence = await detectCandidateSilence(silent, 2000);
      expect(silence[0]?.startMs).toBe(0);
      expect(silence[0]?.endMs).toBeGreaterThan(1990);
      expect(await detectCandidateSilence(audible, 2000)).toEqual([]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("does not bridge missing recording coverage or ignore an overlapping candidate track", () => {
    const silent = {
      endMs: 5000,
      silenceRanges: [{ endMs: 5000, startMs: 0 }],
      sourceId: "a",
      startMs: 0,
    };
    expect(
      candidateExclusionRanges([
        silent,
        { endMs: 3000, silenceRanges: [], sourceId: "b", startMs: 2000 },
        {
          endMs: 7000,
          silenceRanges: [{ endMs: 7000, startMs: 6000 }],
          sourceId: "c",
          startMs: 6000,
        },
      ]),
    ).toEqual([
      { endMs: 2000, sourceId: "a", startMs: 0 },
      { endMs: 5000, sourceId: "a", startMs: 3000 },
      { endMs: 7000, sourceId: "c", startMs: 6000 },
    ]);
  });
});
