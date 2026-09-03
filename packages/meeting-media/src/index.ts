import { execFile } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { canonicalMeetingTranscriptSchema } from "@app/shared/meeting-transcription";
import type { CanonicalMeetingTranscript } from "@app/shared/meeting-transcription";
import type {
  MeetingTranscriptionSourceTrack,
  RecordingIdentity,
} from "@app/shared/meeting-recording";
export { detectCandidateSilence, candidateExclusionRanges } from "./candidate-silence";

export interface FinalTranscriptionAudioChunk {
  recordingIdentity?: RecordingIdentity;
  contentType: string;
  endMs: number;
  filePath: string;
  index: number;
  speakerDisplayName?: string;
  startMs: number;
  track: MeetingTranscriptionSourceTrack;
}

export function isMixedMeetingRecordingSource(source: {
  track: string;
  recordingIdentity?: RecordingIdentity | null;
}): boolean {
  return source.recordingIdentity
    ? source.recordingIdentity.role === "unknown"
    : source.track === "mixed";
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
  recordingIdentity?: RecordingIdentity;
  durationMs: number;
  filePath: string;
  segments?: { durationMs: number; offsetBytes: number; sizeBytes: number }[] | null;
  speakerDisplayName?: string;
  track: MeetingTranscriptionSourceTrack;
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
  chunkDurationMs?: number;
  directory: string;
  ffmpegBin?: string;
  ffmpegTimeoutMs?: number;
  sources: MeetingTranscriptionChunkSource[];
}): Promise<FinalTranscriptionAudioChunk[]> {
  const chunkDurationMs = input.chunkDurationMs ?? MEETING_TRANSCRIPTION_AUDIO_CHUNK_DURATION_MS;
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
        String(chunkDurationMs / 1000),
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
      .filter(
        (name) =>
          name.startsWith(`${source.track}-`) &&
          /^\d+\.webm$/.test(name.slice(source.track.length + 1)),
      )
      .toSorted();
    for (const [index, name] of names.entries()) {
      const startMs = index * chunkDurationMs;
      if (startMs >= source.durationMs) {
        continue;
      }
      chunks.push({
        contentType: "audio/webm",
        endMs:
          (source.recordingIdentity?.offsetMs ?? 0) +
          Math.min(source.durationMs, startMs + chunkDurationMs),
        filePath: join(input.directory, name),
        index,
        recordingIdentity: source.recordingIdentity,
        speakerDisplayName: source.speakerDisplayName,
        startMs: (source.recordingIdentity?.offsetMs ?? 0) + startMs,
        track: source.track,
      });
    }
  }
  return chunks;
}

function normalizeMeetingTranscriptText(value: string): string {
  return value.toLocaleLowerCase().replaceAll(/[\p{P}\p{S}\s]+/gu, "");
}

function meetingTranscriptTextSimilarity(left: string, right: string): number {
  const leftText = normalizeMeetingTranscriptText(left);
  const rightText = normalizeMeetingTranscriptText(right);
  if (!(leftText && rightText)) {
    return 0;
  }
  const leftPairs = new Set(
    Array.from({ length: Math.max(1, leftText.length - 1) }, (_, index) =>
      leftText.slice(index, index + 2),
    ),
  );
  const rightPairs = new Set(
    Array.from({ length: Math.max(1, rightText.length - 1) }, (_, index) =>
      rightText.slice(index, index + 2),
    ),
  );
  const overlap = [...leftPairs].filter((pair) => rightPairs.has(pair)).length;
  return (2 * overlap) / (leftPairs.size + rightPairs.size);
}

function chunkAttribution(
  chunk: FinalTranscriptionAudioChunk,
): CanonicalMeetingTranscript["turns"][number]["attribution"] {
  const source = chunk.recordingIdentity;
  if (source) {
    return {
      method: source.role === "unknown" ? "unconfirmed" : "track",
      participantIdentity: source.participantIdentity,
      role: source.role,
      sourceId: source.sourceId,
    };
  }
  if (chunk.track === "candidate" || chunk.track === "mixed") {
    return {
      method: chunk.track === "candidate" ? "track" : "unconfirmed",
      participantIdentity: null,
      role: chunk.track === "candidate" ? "candidate" : "unknown",
      sourceId: chunk.track,
    };
  }
  return null;
}

function chunkSpeakerName(
  chunk: FinalTranscriptionAudioChunk,
  fallback: string | null | undefined,
) {
  const attribution = chunkAttribution(chunk);
  if (attribution?.role === "candidate") {
    return chunk.speakerDisplayName ?? "候选人";
  }
  if (attribution?.role === "interviewer") {
    return "面试官";
  }
  if (attribution?.role === "unknown") {
    return "待确认";
  }
  return fallback ?? null;
}

function chunkSpeakerIdentity(
  chunk: FinalTranscriptionAudioChunk,
  turn: CanonicalMeetingTranscript["turns"][number],
) {
  const source = chunk.recordingIdentity;
  if (source && source.role !== "unknown") {
    return `${source.role}:${source.participantIdentity ?? source.sourceId}`;
  }
  if (isMixedMeetingRecordingSource(chunk)) {
    return `${chunk.track}:${chunk.index}:${turn.startMs}:${turn.endMs}`;
  }
  return `${chunk.track}:${chunk.index}:${turn.speakerKey}`;
}

export function mergeMeetingTranscriptionChunkResults(
  results: { chunk: FinalTranscriptionAudioChunk; transcript: CanonicalMeetingTranscript }[],
  excludedCandidateRanges: { startMs: number; endMs: number; sourceId: string }[] = [],
): CanonicalMeetingTranscript {
  const candidateTurns = results
    .filter(
      (result) =>
        result.chunk.track === "candidate" ||
        result.chunk.recordingIdentity?.role === "candidate" ||
        result.chunk.recordingIdentity?.role === "interviewer",
    )
    .flatMap((result) => result.transcript.turns);
  const remoteSpeakers = new Map<string, string>();
  const recoveredTurns: { track: string; turn: CanonicalMeetingTranscript["turns"][number] }[] = [];
  const turns = results.flatMap(({ chunk, transcript }) =>
    transcript.turns
      .filter((turn) => {
        if (!isMixedMeetingRecordingSource(chunk)) {
          return true;
        }
        // Deduplicate only a locally aligned utterance. Never propagate a role to an ASR cluster.
        const otherSourceTurns = recoveredTurns
          .filter((item) => item.track !== chunk.track)
          .map((item) => item.turn);
        const duplicate = [...candidateTurns, ...otherSourceTurns].some((candidate) => {
          const overlap =
            Math.min(candidate.endMs, turn.endMs) - Math.max(candidate.startMs, turn.startMs);
          return (
            overlap / Math.max(candidate.endMs - candidate.startMs, turn.endMs - turn.startMs) >=
              0.8 && meetingTranscriptTextSimilarity(candidate.text, turn.text) >= 0.8
          );
        });
        if (!duplicate) {
          recoveredTurns.push({ track: chunk.track, turn });
        }
        return !duplicate;
      })
      .map((turn) => {
        if (
          turn.track === "local" &&
          !chunk.recordingIdentity &&
          chunk.track !== "candidate" &&
          !isMixedMeetingRecordingSource(chunk)
        ) {
          return { ...turn, speakerDisplayName: turn.speakerDisplayName ?? null };
        }
        const identity = chunkSpeakerIdentity(chunk, turn);
        let speakerKey = remoteSpeakers.get(identity);
        if (!speakerKey) {
          speakerKey = `remote-${remoteSpeakers.size + 1}`;
          remoteSpeakers.set(identity, speakerKey);
        }
        const attribution = chunkAttribution(chunk);
        let speakerDisplayName = chunkSpeakerName(chunk, turn.speakerDisplayName);
        const proof = excludedCandidateRanges.find(
          (range) => range.startMs <= turn.startMs - 300 && range.endMs >= turn.endMs + 300,
        );
        const candidateOverlap = results.some(
          (result) =>
            result.chunk.recordingIdentity?.role === "candidate" &&
            result.transcript.turns.some(
              (candidate) => candidate.startMs < turn.endMs && candidate.endMs > turn.startMs,
            ),
        );
        if (isMixedMeetingRecordingSource(chunk) && attribution && proof && !candidateOverlap) {
          attribution.role = "interviewer";
          attribution.method = "candidate-excluded";
          attribution.excludedBySourceIds = proof.sourceId.split(",");
          speakerDisplayName = "面试官";
        }
        return {
          ...turn,
          attribution,
          speakerDisplayName,
          speakerKey,
          track: "remote" as const,
        };
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
