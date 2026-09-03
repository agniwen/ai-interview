import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface AudioTimeRange {
  startMs: number;
  endMs: number;
}

// Only near-digital silence is usable as negative evidence. Ordinary VAD/ASR silence is not.
export async function detectCandidateSilence(
  filePath: string,
  durationMs: number,
): Promise<AudioTimeRange[]> {
  const { stderr } = await promisify(execFile)(
    process.env.FFMPEG_BIN || "ffmpeg",
    [
      "-nostdin",
      "-hide_banner",
      "-i",
      filePath,
      "-map",
      "0:a:0",
      "-af",
      "silencedetect=noise=-90dB:d=0.2",
      "-f",
      "null",
      "-",
    ],
    { maxBuffer: 8 * 1024 * 1024, timeout: 30 * 60_000 },
  );
  const ranges: AudioTimeRange[] = [];
  let start: number | null = null;
  for (const match of stderr.matchAll(/silence_(start|end):\s*([\d.]+)/g)) {
    const ms = Number(match[2]) * 1000;
    if (match[1] === "start") {
      start = Math.max(0, ms);
    } else if (start !== null) {
      ranges.push({ endMs: Math.min(durationMs, ms), startMs: start });
      start = null;
    }
  }
  if (start !== null) {
    ranges.push({ endMs: durationMs, startMs: start });
  }
  return ranges.filter((range) => range.endMs > range.startMs);
}

export function candidateExclusionRanges(
  sources: { sourceId: string; startMs: number; endMs: number; silenceRanges: AudioTimeRange[] }[],
) {
  const boundaries = [
    ...new Set(
      sources.flatMap((source) => [
        source.startMs,
        source.endMs,
        ...source.silenceRanges.flatMap((range) => [range.startMs, range.endMs]),
      ]),
    ),
  ].toSorted((a, b) => a - b);
  const result: (AudioTimeRange & { sourceId: string })[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startMs = boundaries[index];
    const endMs = boundaries[index + 1];
    if (startMs === undefined || endMs === undefined) {
      continue;
    }
    const active = sources.filter((source) => source.startMs <= startMs && source.endMs >= endMs);
    if (
      !active.length ||
      !active.every((source) =>
        source.silenceRanges.some((range) => range.startMs <= startMs && range.endMs >= endMs),
      )
    ) {
      continue;
    }
    const sourceId = active
      .map((source) => source.sourceId)
      .toSorted()
      .join(",");
    const previous = result.at(-1);
    if (previous?.endMs === startMs && previous.sourceId === sourceId) {
      previous.endMs = endMs;
    } else {
      result.push({ endMs, sourceId, startMs });
    }
  }
  return result;
}
