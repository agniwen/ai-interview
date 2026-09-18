import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import type { FinalTranscriptionAudioChunk } from "./index";

export function recoveryWindows(
  chunk: { startMs: number; endMs: number },
  ranges: { startMs: number; endMs: number }[],
  contextMs = 1000,
) {
  const windows = ranges
    .filter((range) => range.startMs < chunk.endMs && range.endMs > chunk.startMs)
    .map((range) => ({
      endMs: Math.min(chunk.endMs, range.endMs + contextMs),
      startMs: Math.max(chunk.startMs, range.startMs - contextMs),
    }))
    .toSorted((a, b) => a.startMs - b.startMs);
  const merged: typeof windows = [];
  for (const window of windows) {
    const last = merged.at(-1);
    if (last && window.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, window.endMs);
    } else {
      merged.push({ ...window });
    }
  }
  return merged;
}

export async function cropRecoveryChunks(
  chunk: FinalTranscriptionAudioChunk,
  ranges: { startMs: number; endMs: number }[],
) {
  const windows = recoveryWindows(chunk, ranges);
  const chunks: FinalTranscriptionAudioChunk[] = [];
  for (const [index, window] of windows.entries()) {
    const filePath = join(
      dirname(chunk.filePath),
      `${chunk.track}-${chunk.index}-recovery-${index}.webm`,
    );
    await promisify(execFile)(
      process.env.FFMPEG_BIN || "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-ss",
        String((window.startMs - chunk.startMs) / 1000),
        "-i",
        chunk.filePath,
        "-t",
        String((window.endMs - window.startMs) / 1000),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libopus",
        filePath,
      ],
      { timeout: 60_000 },
    );
    chunks.push({ ...chunk, ...window, filePath, index: (chunk.index + 1) * 10_000 + index });
  }
  return chunks;
}
