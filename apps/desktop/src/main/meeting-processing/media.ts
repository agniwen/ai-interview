import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open, rename, stat } from "node:fs/promises";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import {
  normalizeMeetingRecordingSegments,
  prepareMeetingTranscriptionAudioChunks,
} from "@app/meeting-media";
import type { MeetingTranscriptionChunkSource } from "@app/meeting-media";
import type { LocalMeetingRecordingStore } from "../meeting-capture/local-meeting-recording-store";
import { localAdoption } from "./adoption";
import type { MeetingTaskStore } from "./task-store";
import type { TaskContext } from "./scheduler";

const execFileAsync = promisify(execFile);
export const localAudioArtifactSchema = z.object({
  contentType: z.string(),
  durationMs: z.number(),
  filePath: z.string(),
  sha256: z.string(),
  sizeBytes: z.number(),
});
export const localMediaOutputSchema = z.object({
  chunks: localAudioArtifactSchema
    .extend({
      endMs: z.number(),
      index: z.number(),
      startMs: z.number(),
      track: z.enum(["microphone", "system"]),
    })
    .array(),
  playback: localAudioArtifactSchema,
});
export type LocalAudioArtifact = z.infer<typeof localAudioArtifactSchema>;

export async function inspectLocalAudio(
  filePath: string,
  durationMs: number,
): Promise<LocalAudioArtifact> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(filePath)) {
    hash.update(bytes);
  }
  const metadata = await stat(filePath);
  return {
    contentType: "audio/webm",
    durationMs,
    filePath,
    sha256: hash.digest("hex"),
    sizeBytes: metadata.size,
  };
}

async function commitAudio(temporaryPath: string, filePath: string): Promise<void> {
  const file = await open(temporaryPath, "r");
  try {
    await file.sync();
  } finally {
    await file.close();
  }
  await rename(temporaryPath, filePath);
  const directory = await open(dirname(filePath), "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}

export function createLocalMediaHandler(input: {
  store: LocalMeetingRecordingStore;
  root: string;
  ffmpegBin: string;
  tasks?: MeetingTaskStore;
}) {
  return async (context: TaskContext) => {
    const directory = join(input.root, context.task.meeting_id, context.task.input_revision);
    await mkdir(directory, { mode: 0o700, recursive: true });
    const adopted = input.tasks ? localAdoption(input.tasks, context.task.meeting_id) : null;
    const { sources, descriptor } =
      adopted && !adopted.useLocalCapture
        ? {
            descriptor: adopted.context,
            sources: adopted.sources.map((source) => ({
              ...source,
              segments: source.segments ?? undefined,
            })),
          }
        : await input.store.materializeProcessingSources(
            context.task.meeting_id,
            directory,
            context.signal,
          );
    const normalized: MeetingTranscriptionChunkSource[] = [];
    for (const source of sources) {
      context.signal.throwIfAborted();
      const filePath = await normalizeMeetingRecordingSegments({
        ffmpegBin: input.ffmpegBin,
        outputPath: join(directory, `${source.track}-normalized.webm`),
        segments: source.segments,
        signal: context.signal,
        sourcePath: source.filePath,
      });
      normalized.push({ ...source, filePath, segments: null });
    }
    const [microphone, system] = normalized;
    if (!(microphone && system)) {
      throw new Error("本地双轨音频不完整");
    }
    const outputPath = join(directory, "playback.webm");
    const temporaryPath = `${outputPath}.partial`;
    await execFileAsync(
      input.ffmpegBin,
      [
        "-nostdin",
        "-y",
        "-i",
        microphone.filePath,
        "-i",
        system.filePath,
        "-filter_complex",
        "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0[a]",
        "-map",
        "[a]",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        "-f",
        "webm",
        temporaryPath,
      ],
      { maxBuffer: 4 * 1024 * 1024, signal: context.signal, timeout: 30 * 60 * 1000 },
    );
    await commitAudio(temporaryPath, outputPath);
    const playback = await inspectLocalAudio(
      outputPath,
      Math.max(microphone.durationMs, system.durationMs),
    );
    context.checkpoint({ playback });
    context.signal.throwIfAborted();
    if (descriptor.liveTranscriptDraft?.provider === "deepgram") {
      return localMediaOutputSchema.parse({ chunks: [], playback });
    }
    const prepared = await prepareMeetingTranscriptionAudioChunks({
      directory,
      ffmpegBin: input.ffmpegBin,
      signal: context.signal,
      sources: normalized,
    });
    const chunks: (LocalAudioArtifact & {
      index: number;
      startMs: number;
      endMs: number;
      track: string;
    })[] = [];
    for (const chunk of prepared) {
      const file = await open(chunk.filePath, "r");
      try {
        await file.sync();
      } finally {
        await file.close();
      }
      const audio = await inspectLocalAudio(chunk.filePath, chunk.endMs - chunk.startMs);
      chunks.push({
        ...audio,
        endMs: chunk.endMs,
        index: chunk.index,
        startMs: chunk.startMs,
        track: chunk.track,
      });
    }
    return localMediaOutputSchema.parse({ chunks, playback });
  };
}
