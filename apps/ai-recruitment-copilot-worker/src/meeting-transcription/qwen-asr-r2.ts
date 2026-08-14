import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import {
  buildMeetingTranscriptionStagingKey,
  deleteMeetingRecordingObject,
  presignRecordingGetObjectUrl,
  putMeetingRecordingFile,
} from "@arc/ai-recruitment-copilot-backend/lib/server/s3";
import type { FinalTranscriptionAudioChunk } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/provider";

const execFileAsync = promisify(execFile);

const STAGING_UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;

function positiveEnvInteger(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const value = Number.parseInt(env[name] ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(filePath), hash);
  return hash.digest("hex");
}

/**
 * DashScope 只接受公网可访问的音频 URL。worker 把每个 chunk 先转成 WAV（百炼
 * 对 WAV 支持最稳），上传到 Recording R2 的 staging 前缀，再签发短时效 GET URL；
 * 转录结束后按 URL 回查对象并删除。
 *
 * DashScope only accepts publicly reachable audio URLs: convert each chunk to WAV
 * (the safest supported container), stage it in Recording R2, presign a short-lived
 * GET URL, and delete the staged object once transcription finishes.
 */
export function createQwenAsrAudioUrlDependencies(input: {
  env?: NodeJS.ProcessEnv;
  meetingId: string;
  organizationId: string;
  stagingToken: string;
}): {
  createAudioUrl: (chunk: FinalTranscriptionAudioChunk, signal: AbortSignal) => Promise<string>;
  deleteAudioUrl: (url: string, signal: AbortSignal) => Promise<void>;
} {
  const env = input.env ?? process.env;
  const ffmpegBin = env.FFMPEG_BIN?.trim() || "ffmpeg";
  const urlExpiresSeconds = positiveEnvInteger(
    env,
    "MEETING_TRANSCRIPTION_QWEN_URL_EXPIRES_SECONDS",
    3600,
  );
  const stagedByUrl = new Map<string, string>();

  async function createAudioUrl(chunk: FinalTranscriptionAudioChunk): Promise<string> {
    const wavPath = `${chunk.filePath}.wav`;
    await execFileAsync(
      ffmpegBin,
      [
        "-nostdin",
        "-y",
        "-i",
        chunk.filePath,
        "-map",
        "0:a:0",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        wavPath,
      ],
      {
        killSignal: "SIGKILL",
        maxBuffer: 4 * 1024 * 1024,
        timeout: positiveEnvInteger(env, "MEETING_TRANSCRIPTION_FFMPEG_TIMEOUT_MS", 10 * 60 * 1000),
      },
    );
    const [sizeBytes, sha256] = await Promise.all([stat(wavPath), sha256File(wavPath)]);
    const storageKey = await buildMeetingTranscriptionStagingKey({
      index: chunk.index,
      meetingId: input.meetingId,
      organizationId: input.organizationId,
      stagingToken: input.stagingToken,
      track: chunk.track,
    });
    await putMeetingRecordingFile({
      contentType: "audio/wav",
      deadlineAt: new Date(Date.now() + STAGING_UPLOAD_TIMEOUT_MS),
      filePath: wavPath,
      sha256,
      sizeBytes: sizeBytes.size,
      storageKey,
    });
    const url = await presignRecordingGetObjectUrl(storageKey, urlExpiresSeconds);
    stagedByUrl.set(url, storageKey);
    return url;
  }

  return {
    createAudioUrl,
    async deleteAudioUrl(url: string) {
      const storageKey = stagedByUrl.get(url);
      if (!storageKey) {
        return;
      }
      stagedByUrl.delete(url);
      await deleteMeetingRecordingObject(storageKey);
    },
  };
}
