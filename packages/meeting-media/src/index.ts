import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type { CanonicalMeetingTranscript } from "@arc/shared/meeting-transcription";

export interface FinalTranscriptionAudioChunk {
  contentType: string;
  endMs: number;
  filePath: string;
  index: number;
  startMs: number;
  track: "microphone" | "system";
}

const execFileAsync = promisify(execFile);
export const MEETING_TRANSCRIPTION_AUDIO_CHUNK_DURATION_MS = 30 * 60 * 1000;

export function assertMeetingTranscriptionFfmpegAvailable(versionLine: string): void {
  if (!versionLine.startsWith("ffmpeg version ")) {
    throw new Error("FFmpeg version output is invalid");
  }
}

export function assertMeetingTranscriptionFfmpegVersion(
  versionLine: string,
  expected?: string,
): void {
  const expectedPrefix = expected?.trim();
  if (!expectedPrefix) {
    throw new Error("MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX is required");
  }
  if (!versionLine.startsWith(expectedPrefix)) {
    throw new Error(`FFmpeg version mismatch; expected prefix ${expectedPrefix}`);
  }
}

export async function readMeetingTranscriptionFfmpegVersion(ffmpegBin?: string): Promise<string> {
  const { stdout } = await execFileAsync(ffmpegBin?.trim() || "ffmpeg", ["-version"], {
    timeout: 10_000,
  });
  return stdout.split("\n")[0] ?? "";
}

export interface MeetingTranscriptionChunkSource {
  durationMs: number;
  filePath: string;
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
  track: "microphone" | "system";
}

export async function normalizeMeetingRecordingSegments(input: {
  ffmpegBin?: string;
  ffmpegTimeoutMs?: number;
  outputPath: string;
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
  sourcePath: string;
}): Promise<string> {
  if (!input.segments || input.segments.length <= 1) {
    return input.sourcePath;
  }
  const segmentPaths: string[] = [];
  for (const [index, segment] of input.segments.entries()) {
    const segmentPath = join(dirname(input.outputPath), `source-segment-${index}.webm`);
    await pipeline(
      createReadStream(input.sourcePath, {
        end: segment.offsetBytes + segment.sizeBytes - 1,
        start: segment.offsetBytes,
      }),
      createWriteStream(segmentPath, { mode: 0o600 }),
    );
    segmentPaths.push(segmentPath);
  }
  const concatPath = `${input.outputPath}.ffconcat`;
  await writeFile(
    concatPath,
    `ffconcat version 1.0\n${segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n")}\n`,
    { mode: 0o600 },
  );
  await execFileAsync(
    input.ffmpegBin?.trim() || "ffmpeg",
    [
      "-nostdin",
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatPath,
      "-map",
      "0:a:0",
      "-c:a",
      "libopus",
      "-f",
      "webm",
      input.outputPath,
    ],
    { timeout: input.ffmpegTimeoutMs ?? 30 * 60 * 1000 },
  );
  return input.outputPath;
}

export async function prepareMeetingTranscriptionAudioChunks(input: {
  directory: string;
  ffmpegBin?: string;
  ffmpegTimeoutMs?: number;
  sources: MeetingTranscriptionChunkSource[];
}): Promise<FinalTranscriptionAudioChunk[]> {
  const chunks: FinalTranscriptionAudioChunk[] = [];
  for (const source of input.sources) {
    const normalizedSourcePath = await normalizeMeetingRecordingSegments({
      ffmpegBin: input.ffmpegBin,
      ffmpegTimeoutMs: input.ffmpegTimeoutMs,
      outputPath: join(input.directory, `${source.track}-normalized.webm`),
      segments: source.segments,
      sourcePath: source.filePath,
    });
    const outputPattern = join(input.directory, `${source.track}-%03d.webm`);
    await execFileAsync(
      input.ffmpegBin?.trim() || "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-i",
        normalizedSourcePath,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "libopus",
        "-b:a",
        "32k",
        "-f",
        "segment",
        "-segment_time",
        String(MEETING_TRANSCRIPTION_AUDIO_CHUNK_DURATION_MS / 1000),
        "-reset_timestamps",
        "1",
        outputPattern,
      ],
      {
        killSignal: "SIGKILL",
        maxBuffer: 4 * 1024 * 1024,
        timeout: input.ffmpegTimeoutMs ?? 30 * 60 * 1000,
      },
    );
    const directoryEntries = await readdir(input.directory);
    const names = directoryEntries
      .filter((name) => name.startsWith(`${source.track}-`) && name.endsWith(".webm"))
      .toSorted();
    for (const [index, name] of names.entries()) {
      const startMs = index * MEETING_TRANSCRIPTION_AUDIO_CHUNK_DURATION_MS;
      if (startMs >= source.durationMs) {
        continue;
      }
      chunks.push({
        contentType: "audio/webm",
        endMs: Math.min(source.durationMs, startMs + MEETING_TRANSCRIPTION_AUDIO_CHUNK_DURATION_MS),
        filePath: join(input.directory, name),
        index,
        startMs,
        track: source.track,
      });
    }
  }
  return chunks;
}

export function mergeMeetingTranscriptionChunkResults(
  results: { chunk: FinalTranscriptionAudioChunk; transcript: CanonicalMeetingTranscript }[],
): CanonicalMeetingTranscript {
  const remoteSpeakers = new Map<string, string>();
  const turns = results.flatMap(({ chunk, transcript }) =>
    transcript.turns.map((turn) => {
      if (turn.track === "local") {
        return turn;
      }
      const identity = `${chunk.track}:${chunk.index}:${turn.speakerKey}`;
      let speakerKey = remoteSpeakers.get(identity);
      if (!speakerKey) {
        speakerKey = `remote-${remoteSpeakers.size + 1}`;
        remoteSpeakers.set(identity, speakerKey);
      }
      return { ...turn, speakerKey };
    }),
  );
  turns.sort(
    (left, right) =>
      left.startMs - right.startMs ||
      left.track.localeCompare(right.track) ||
      left.endMs - right.endMs,
  );
  return canonicalMeetingTranscriptSchema.parse({
    language: results.find((result) => result.transcript.language)?.transcript.language ?? null,
    turns,
  });
}
