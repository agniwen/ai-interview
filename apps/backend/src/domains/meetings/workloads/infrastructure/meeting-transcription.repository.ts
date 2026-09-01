/* oxlint-disable max-lines, no-nested-ternary -- Transcription claims, chunk checkpoints, media staging, and publication share one durable state machine. */
import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import type { meetingTranscriptionPolicy } from "@arc/db-schema/schema";
import {
  meetingProcessingRun,
  meetingSearchProjection,
  meetingSession,
  meetingTranscriptRevision,
  meetingTranscriptTurn,
  meetingTranscriptionChunk,
} from "@arc/db-schema/schema";
import type { MeetingTranscriptionJobData } from "@arc/meeting-processing-queue/meeting-transcription";
import { canonicalMeetingTranscriptSchema } from "@arc/shared/meeting-transcription";
import type { CanonicalMeetingTranscript } from "@arc/shared/meeting-transcription";
import { and, eq, max, ne } from "drizzle-orm";
import type { WorkloadObjectStorage } from "../../../../infrastructure/object-storage/workload-object-storage.port.js";
import type { Database } from "../../../../infrastructure/database/database.tokens.js";
import { createMeetingTranscriptionProcessorPorts } from "../meeting-transcription.processor.js";
import type {
  FinalTranscriptionAudioChunk,
  MeetingTranscriptionExternalPorts,
} from "../meeting-transcription.processor.js";
import type { MeetingRecoveryCommands } from "../../public.js";
import { transcribeQwenChunk } from "./qwen-asr.provider.js";

const execFileAsync = promisify(execFile);
const CHUNK_MS = 30 * 60 * 1000;

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const parsed = Number.parseInt(env[name] ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function policyAllows(
  policy: typeof meetingTranscriptionPolicy.$inferSelect | null | undefined,
  provider: string,
) {
  return Boolean(policy) && provider === "qwen";
}

function chunkWhere(input: MeetingTranscriptionJobData, chunk: FinalTranscriptionAudioChunk) {
  return and(
    eq(meetingTranscriptionChunk.meetingId, input.meetingId),
    eq(meetingTranscriptionChunk.sourceManifestSha256, input.sourceManifestSha256),
    eq(meetingTranscriptionChunk.policyRevision, input.policyRevision),
    eq(meetingTranscriptionChunk.provider, input.provider),
    eq(meetingTranscriptionChunk.model, input.model),
    eq(meetingTranscriptionChunk.region, input.region),
    eq(meetingTranscriptionChunk.pipelineVersion, input.pipelineVersion),
    eq(meetingTranscriptionChunk.track, chunk.track),
    eq(meetingTranscriptionChunk.chunkIndex, chunk.index),
    eq(meetingTranscriptionChunk.startMs, chunk.startMs),
    eq(meetingTranscriptionChunk.endMs, chunk.endMs),
  );
}

function revisionWhere(input: MeetingTranscriptionJobData) {
  return and(
    eq(meetingTranscriptRevision.meetingId, input.meetingId),
    eq(meetingTranscriptRevision.kind, "final"),
    eq(meetingTranscriptRevision.sourceManifestSha256, input.sourceManifestSha256),
    eq(meetingTranscriptRevision.provider, input.provider),
    eq(meetingTranscriptRevision.model, input.model),
    eq(meetingTranscriptRevision.region, input.region),
    eq(meetingTranscriptRevision.pipelineVersion, input.pipelineVersion),
  );
}

export class MeetingTranscriptionInfrastructure {
  private readonly database: Database;
  private readonly env: NodeJS.ProcessEnv;
  private readonly meetingRecovery: MeetingRecoveryCommands;
  private readonly storage: WorkloadObjectStorage;

  constructor(
    database: Database,
    storage: WorkloadObjectStorage,
    meetingRecovery: MeetingRecoveryCommands,
    env: NodeJS.ProcessEnv = rawBackendEnvironment,
  ) {
    this.database = database;
    this.storage = storage;
    this.meetingRecovery = meetingRecovery;
    this.env = env;
  }

  ports() {
    const external: MeetingTranscriptionExternalPorts = {
      claim: (input) => this.claim(input),
      claimChunk: (input, chunk) => this.claimChunk(input, chunk),
      downloadSource: (input) => this.storage.downloadToFile(input),
      loadSource: (input) =>
        this.database.query.meetingSession.findFirst({
          where: { id: input.meetingId, organizationId: input.organizationId, status: "ready" },
          with: { assets: true },
        }),
      markChunkFailed: (input, chunk) => this.markChunkFailed(input, chunk),
      markFailed: (input) => this.markFailed(input),
      prepareChunks: (input) => this.prepareChunks(input),
      publish: (input) => this.publish(input),
      requestIntelligence: (input) => this.requestIntelligence(input),
      saveChunkCheckpoint: (input, chunk, transcript) =>
        this.saveChunkCheckpoint(input, chunk, transcript),
      transcribeFinal: (input) => this.transcribe(input.chunks, input.job),
    };
    return createMeetingTranscriptionProcessorPorts(external);
  }

  private claim(
    input: MeetingTranscriptionJobData & { attempt: number; processingRunId: string },
  ): Promise<"already-ready" | "claimed" | "not-current"> {
    return this.database.transaction(async (tx) => {
      const policy = await tx.query.meetingTranscriptionPolicy.findFirst({
        where: { organizationId: input.organizationId, revision: input.policyRevision },
      });
      if (!policyAllows(policy, input.provider)) {
        return "not-current";
      }
      const [meeting] = await tx
        .select({
          activeTranscriptRevisionId: meetingSession.activeTranscriptRevisionId,
          manifestSha256: meetingSession.manifestSha256,
          transcriptionRunId: meetingSession.transcriptionRunId,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
            eq(meetingSession.status, "ready"),
          ),
        )
        .for("update")
        .limit(1);
      if (!meeting || meeting.manifestSha256 !== input.sourceManifestSha256) {
        return "not-current";
      }
      const [existing] = await tx
        .select({ id: meetingTranscriptRevision.id })
        .from(meetingTranscriptRevision)
        .where(revisionWhere(input))
        .limit(1);
      if (existing) {
        await tx
          .update(meetingSession)
          .set({
            activeTranscriptRevisionId: meeting.activeTranscriptRevisionId ?? existing.id,
            transcriptionError: null,
            transcriptionRunId: null,
            transcriptionStatus: "ready",
          })
          .where(eq(meetingSession.id, input.meetingId));
        if (meeting.transcriptionRunId) {
          await tx
            .update(meetingProcessingRun)
            .set({ finishedAt: new Date(), status: "succeeded" })
            .where(eq(meetingProcessingRun.id, meeting.transcriptionRunId));
        }
        return "already-ready";
      }
      if (meeting.transcriptionRunId && meeting.transcriptionRunId !== input.processingRunId) {
        await tx
          .update(meetingProcessingRun)
          .set({
            errorCode: "superseded",
            errorMessage: "Processing run was superseded by a later delivery",
            finishedAt: new Date(),
            status: "failed",
          })
          .where(eq(meetingProcessingRun.id, meeting.transcriptionRunId));
      }
      await tx.insert(meetingProcessingRun).values({
        attempt: input.attempt,
        id: input.processingRunId,
        idempotencyKey: [
          input.meetingId,
          input.sourceManifestSha256,
          input.policyRevision,
          input.provider,
          input.model,
          input.region,
          input.pipelineVersion,
          input.attempt,
          input.processingRunId,
        ].join(":"),
        meetingId: input.meetingId,
        model: input.model,
        organizationId: input.organizationId,
        pipelineVersion: input.pipelineVersion,
        provider: input.provider,
        region: input.region,
        stage: "final-transcription",
        status: "processing",
      });
      await tx
        .update(meetingSession)
        .set({
          transcriptionError: null,
          transcriptionRunId: input.processingRunId,
          transcriptionStatus: "processing",
        })
        .where(eq(meetingSession.id, input.meetingId));
      return "claimed";
    });
  }

  private claimChunk(
    input: MeetingTranscriptionJobData & { processingRunId: string },
    chunk: FinalTranscriptionAudioChunk,
  ) {
    return this.database.transaction(async (tx) => {
      const policy = await tx.query.meetingTranscriptionPolicy.findFirst({
        where: { organizationId: input.organizationId, revision: input.policyRevision },
      });
      const meeting = await tx.query.meetingSession.findFirst({
        where: { id: input.meetingId, organizationId: input.organizationId },
      });
      if (
        !policyAllows(policy, input.provider) ||
        meeting?.transcriptionRunId !== input.processingRunId
      ) {
        return { status: "not-current" as const };
      }
      const [inserted] = await tx
        .insert(meetingTranscriptionChunk)
        .values({
          chunkIndex: chunk.index,
          endMs: chunk.endMs,
          id: randomUUID(),
          meetingId: input.meetingId,
          model: input.model,
          organizationId: input.organizationId,
          pipelineVersion: input.pipelineVersion,
          policyRevision: input.policyRevision,
          processingRunId: input.processingRunId,
          provider: input.provider,
          region: input.region,
          sourceManifestSha256: input.sourceManifestSha256,
          startMs: chunk.startMs,
          status: "processing",
          track: chunk.track,
          transcript: null,
        })
        .onConflictDoNothing()
        .returning({ id: meetingTranscriptionChunk.id });
      if (inserted) {
        return { status: "claimed" as const };
      }
      const [existing] = await tx
        .select()
        .from(meetingTranscriptionChunk)
        .where(chunkWhere(input, chunk))
        .for("update")
        .limit(1);
      if (!existing) {
        return { status: "busy" as const };
      }
      if (existing.status === "succeeded") {
        return {
          status: "ready" as const,
          transcript: canonicalMeetingTranscriptSchema.parse(existing.transcript),
        };
      }
      if (existing.status === "failed") {
        await tx
          .update(meetingTranscriptionChunk)
          .set({
            processingRunId: input.processingRunId,
            status: "processing",
            transcript: null,
            updatedAt: new Date(),
          })
          .where(eq(meetingTranscriptionChunk.id, existing.id));
        return { status: "claimed" as const };
      }
      const reclaimed = await tx
        .update(meetingTranscriptionChunk)
        .set({ processingRunId: input.processingRunId, updatedAt: new Date() })
        .where(
          and(
            eq(meetingTranscriptionChunk.id, existing.id),
            ne(meetingTranscriptionChunk.processingRunId, input.processingRunId),
          ),
        )
        .returning({ id: meetingTranscriptionChunk.id });
      return { status: reclaimed.length > 0 ? ("claimed" as const) : ("busy" as const) };
    });
  }

  private async saveChunkCheckpoint(
    input: MeetingTranscriptionJobData & { processingRunId: string },
    chunk: FinalTranscriptionAudioChunk,
    transcript: CanonicalMeetingTranscript,
  ) {
    await this.database
      .update(meetingTranscriptionChunk)
      .set({ status: "succeeded", transcript, updatedAt: new Date() })
      .where(
        and(
          chunkWhere(input, chunk),
          eq(meetingTranscriptionChunk.status, "processing"),
          eq(meetingTranscriptionChunk.processingRunId, input.processingRunId),
        ),
      );
    const [saved] = await this.database
      .select({ transcript: meetingTranscriptionChunk.transcript })
      .from(meetingTranscriptionChunk)
      .where(and(chunkWhere(input, chunk), eq(meetingTranscriptionChunk.status, "succeeded")))
      .limit(1);
    if (!saved) {
      throw new Error("Meeting transcription chunk checkpoint 写入失败");
    }
    return canonicalMeetingTranscriptSchema.parse(saved.transcript);
  }

  private async markChunkFailed(
    input: MeetingTranscriptionJobData & { processingRunId: string },
    chunk: FinalTranscriptionAudioChunk,
  ) {
    await this.database
      .update(meetingTranscriptionChunk)
      .set({ status: "failed", transcript: null, updatedAt: new Date() })
      .where(
        and(
          chunkWhere(input, chunk),
          eq(meetingTranscriptionChunk.status, "processing"),
          eq(meetingTranscriptionChunk.processingRunId, input.processingRunId),
        ),
      );
  }

  private markFailed(input: Parameters<MeetingTranscriptionExternalPorts["markFailed"]>[0]) {
    return this.database.transaction(async (tx) => {
      let transcriptionError: string | null = null;
      if (input.terminal) {
        transcriptionError =
          input.errorCode === "provider-quota"
            ? "最终会议转录因 provider 配额不足失败，录音已保留，请稍后重试。"
            : "最终会议转录失败，请稍后重试。";
      }
      const [updated] = await tx
        .update(meetingSession)
        .set({
          transcriptionError,
          transcriptionRunId: null,
          transcriptionStatus: input.terminal ? "failed" : "processing",
        })
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
            eq(meetingSession.transcriptionRunId, input.processingRunId),
          ),
        )
        .returning({ id: meetingSession.id });
      if (!updated) {
        return false;
      }
      await tx
        .update(meetingProcessingRun)
        .set({
          errorCode: input.errorCode,
          errorMessage: input.errorMessage.slice(0, 1000),
          finishedAt: new Date(),
          status: "failed",
        })
        .where(
          and(
            eq(meetingProcessingRun.id, input.processingRunId),
            eq(meetingProcessingRun.status, "processing"),
          ),
        );
      return true;
    });
  }

  private publish(input: Parameters<MeetingTranscriptionExternalPorts["publish"]>[0]) {
    return this.database.transaction(async (tx) => {
      const policy = await tx.query.meetingTranscriptionPolicy.findFirst({
        where: { organizationId: input.organizationId, revision: input.policyRevision },
      });
      const [meeting] = await tx
        .select({
          status: meetingSession.status,
          transcriptionRunId: meetingSession.transcriptionRunId,
        })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
          ),
        )
        .for("update")
        .limit(1);
      if (
        !policyAllows(policy, input.provider) ||
        meeting?.status !== "ready" ||
        meeting.transcriptionRunId !== input.processingRunId
      ) {
        return false;
      }
      const [existing] = await tx
        .select({ id: meetingTranscriptRevision.id })
        .from(meetingTranscriptRevision)
        .where(revisionWhere(input))
        .limit(1);
      let revisionId = existing?.id;
      if (!revisionId) {
        const [latest] = await tx
          .select({ revision: max(meetingTranscriptRevision.revision) })
          .from(meetingTranscriptRevision)
          .where(eq(meetingTranscriptRevision.meetingId, input.meetingId));
        revisionId = randomUUID();
        await tx.insert(meetingTranscriptRevision).values({
          id: revisionId,
          kind: "final",
          language: input.transcript.language,
          meetingId: input.meetingId,
          model: input.model,
          organizationId: input.organizationId,
          pipelineVersion: input.pipelineVersion,
          processingRunId: input.processingRunId,
          provider: input.provider,
          region: input.region,
          revision: Number(latest?.revision ?? 0) + 1,
          sourceManifestSha256: input.sourceManifestSha256,
        });
        if (input.transcript.turns.length > 0) {
          await tx.insert(meetingTranscriptTurn).values(
            input.transcript.turns.map((turn, sequence) => ({
              ...turn,
              id: randomUUID(),
              revisionId,
              sequence,
            })),
          );
        }
      }
      await tx
        .update(meetingProcessingRun)
        .set({ finishedAt: new Date(), status: "succeeded" })
        .where(eq(meetingProcessingRun.id, input.processingRunId));
      await tx
        .update(meetingSession)
        .set({
          activeTranscriptRevisionId: revisionId,
          transcriptionError: null,
          transcriptionRunId: null,
          transcriptionStatus: "ready",
        })
        .where(eq(meetingSession.id, input.meetingId));
      const searchText = input.transcript.turns
        .map((turn) => turn.text)
        .join("\n")
        .slice(0, 500_000);
      await tx
        .insert(meetingSearchProjection)
        .values({
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          searchText,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          set: { organizationId: input.organizationId, searchText, updatedAt: new Date() },
          target: meetingSearchProjection.meetingId,
        });
      return true;
    });
  }

  private async prepareChunks(
    input: Parameters<MeetingTranscriptionExternalPorts["prepareChunks"]>[0],
  ) {
    const chunks: FinalTranscriptionAudioChunk[] = [];
    for (const source of input.sources) {
      let mediaPath = source.filePath;
      if (source.segments && source.segments.length > 1) {
        const handle = await open(source.filePath, "r");
        const segmentPaths: string[] = [];
        try {
          for (const [index, segment] of source.segments.entries()) {
            const buffer = Buffer.alloc(segment.sizeBytes);
            await handle.read(buffer, 0, segment.sizeBytes, segment.offsetBytes);
            const segmentPath = join(input.directory, `${source.track}-source-${index}.webm`);
            await writeFile(segmentPath, buffer);
            segmentPaths.push(segmentPath);
          }
        } finally {
          await handle.close();
        }
        const concatPath = join(input.directory, `${source.track}-sources.txt`);
        await writeFile(
          concatPath,
          segmentPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n"),
        );
        mediaPath = join(input.directory, `${source.track}-normalized.webm`);
        await execFileAsync(
          this.env.FFMPEG_BIN || "ffmpeg",
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
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "libopus",
            "-b:a",
            "32k",
            mediaPath,
          ],
          { timeout: integer(this.env, "MEETING_TRANSCRIPTION_FFMPEG_TIMEOUT_MS", 30 * 60 * 1000) },
        );
      }
      const pattern = join(input.directory, `${source.track}-%03d.webm`);
      await execFileAsync(
        this.env.FFMPEG_BIN || "ffmpeg",
        [
          "-nostdin",
          "-y",
          "-i",
          mediaPath,
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
          String(CHUNK_MS / 1000),
          "-reset_timestamps",
          "1",
          pattern,
        ],
        { timeout: integer(this.env, "MEETING_TRANSCRIPTION_FFMPEG_TIMEOUT_MS", 30 * 60 * 1000) },
      );
      const directoryEntries = await readdir(input.directory);
      const names = directoryEntries
        .filter((name) => name.startsWith(`${source.track}-`) && name.endsWith(".webm"))
        .toSorted();
      for (const [index, name] of names.entries()) {
        const startMs = index * CHUNK_MS;
        if (startMs < source.durationMs) {
          chunks.push({
            contentType: "audio/webm",
            endMs: Math.min(source.durationMs, startMs + CHUNK_MS),
            filePath: join(input.directory, name),
            index,
            startMs,
            track: source.track,
          });
        }
      }
    }
    return chunks;
  }

  private async transcribe(
    chunks: FinalTranscriptionAudioChunk[],
    job: MeetingTranscriptionJobData,
  ) {
    if (job.provider !== "qwen") {
      throw new Error(`Unsupported transcription provider ${job.provider}`);
    }
    const baseUrl =
      this.env.MEETING_TRANSCRIPTION_QWEN_BASE_URL || "https://dashscope.aliyuncs.com";
    const { origin } = new URL(baseUrl);
    let expectedRegion: "qwen-cn-beijing" | "qwen-singapore" | null = null;
    if (origin === "https://dashscope.aliyuncs.com") {
      expectedRegion = "qwen-cn-beijing";
    } else if (origin === "https://dashscope-intl.aliyuncs.com") {
      expectedRegion = "qwen-singapore";
    }
    if (!expectedRegion || job.region !== expectedRegion) {
      throw new Error("Meeting transcription Qwen endpoint and persisted region do not match");
    }
    const results: CanonicalMeetingTranscript["turns"] = [];
    for (const chunk of chunks) {
      const wavPath = `${chunk.filePath}.wav`;
      await execFileAsync(
        this.env.FFMPEG_BIN || "ffmpeg",
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
        { timeout: integer(this.env, "MEETING_TRANSCRIPTION_FFMPEG_TIMEOUT_MS", 10 * 60 * 1000) },
      );
      const details = await stat(wavPath);
      const hash = createHash("sha256");
      await pipeline(createReadStream(wavPath), hash);
      const storageKey = this.storage.buildTranscriptionStagingKey({
        index: chunk.index,
        meetingId: job.meetingId,
        organizationId: job.organizationId,
        stagingToken: randomUUID(),
        track: chunk.track,
      });
      await this.storage.putFile({
        contentType: "audio/wav",
        deadlineAt: new Date(Date.now() + 10 * 60 * 1000),
        filePath: wavPath,
        sha256: hash.digest("hex"),
        sizeBytes: details.size,
        storageKey,
      });
      const url = await this.storage.presignGet(
        storageKey,
        integer(this.env, "MEETING_TRANSCRIPTION_QWEN_URL_EXPIRES_SECONDS", 3600),
      );
      try {
        const transcript = await transcribeQwenChunk({
          apiKey: this.env.ALIBABA_API_KEY || "",
          audioUrl: url,
          baseUrl,
          chunk,
          model: this.env.MEETING_TRANSCRIPTION_QWEN_MODEL || "qwen3-asr-flash-filetrans",
          pollIntervalMs: integer(this.env, "MEETING_TRANSCRIPTION_QWEN_POLL_INTERVAL_MS", 5000),
          pollTimeoutMs: integer(this.env, "MEETING_TRANSCRIPTION_QWEN_POLL_TIMEOUT_MS", 1_500_000),
        });
        results.push(...transcript.turns);
      } finally {
        await this.storage.delete(storageKey).catch(() => {
          console.warn("[meeting-transcription] staging object cleanup failed", {
            storageKey,
          });
        });
      }
    }
    return canonicalMeetingTranscriptSchema.parse({
      language: null,
      turns: results.toSorted(
        (left, right) => left.startMs - right.startMs || left.track.localeCompare(right.track),
      ),
    });
  }

  private async requestIntelligence(_input: { meetingId: string; organizationId: string }) {
    await this.meetingRecovery.recoverMissingMeetingIntelligence();
  }
}
