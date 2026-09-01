import { and, eq, inArray } from "drizzle-orm";
import {
  meetingRecordingAsset,
  meetingSession,
  meetingStorageCleanupKey,
} from "@arc/db-schema/schema";
import type { MeetingPlaybackJobData } from "@arc/meeting-processing-queue/meeting-playback";
import type { BackgroundQueueProducerService } from "../../../../background/background-queue-producer.service.js";
import type { WorkloadObjectStorage } from "../../../../infrastructure/object-storage/workload-object-storage.port.js";
import type { Database } from "../../../../infrastructure/database/database.tokens.js";
import { createMeetingPlaybackProcessorPorts } from "../meeting-playback.processor.js";
import type { MeetingPlaybackProcessorPorts } from "../meeting-playback.processor.js";
import type { MeetingRecoveryCommands } from "../../public.js";

export class MeetingPlaybackRepository {
  private readonly database: Database;

  constructor(database: Database) {
    this.database = database;
  }

  loadSource(input: MeetingPlaybackJobData) {
    return this.database.query.meetingSession.findFirst({
      where: {
        id: input.meetingId,
        organizationId: input.organizationId,
        status: { in: ["workspace-verified", "processing", "processing-failed", "ready"] },
      },
      with: { assets: true },
    });
  }

  async markProcessing(input: MeetingPlaybackJobData & { processingRunId: string }) {
    const updated = await this.database
      .update(meetingSession)
      .set({ processingError: null, processingRunId: input.processingRunId, status: "processing" })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          inArray(meetingSession.status, ["workspace-verified", "processing", "processing-failed"]),
        ),
      )
      .returning({ id: meetingSession.id });
    return updated.length > 0;
  }

  registerCleanupKey(
    input: MeetingPlaybackJobData & { processingRunId: string; storageKey: string },
  ) {
    const writerLeaseExpiresAt = new Date(Date.now() + 12 * 60 * 1000);
    return this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({ id: meetingSession.id })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
            eq(meetingSession.processingRunId, input.processingRunId),
            eq(meetingSession.status, "processing"),
          ),
        )
        .for("share")
        .limit(1);
      if (!meeting) {
        return null;
      }
      await tx
        .insert(meetingStorageCleanupKey)
        .values({
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          storageKey: input.storageKey,
          writerLeaseExpiresAt,
        })
        .onConflictDoUpdate({
          set: {
            finalSweepCompletedAt: null,
            initialSweepCompletedAt: null,
            writerLeaseExpiresAt,
          },
          target: meetingStorageCleanupKey.storageKey,
        });
      return { writerLeaseExpiresAt };
    });
  }

  async removeCleanupKey(input: { meetingId: string; organizationId: string; storageKey: string }) {
    await this.database
      .delete(meetingStorageCleanupKey)
      .where(
        and(
          eq(meetingStorageCleanupKey.meetingId, input.meetingId),
          eq(meetingStorageCleanupKey.organizationId, input.organizationId),
          eq(meetingStorageCleanupKey.storageKey, input.storageKey),
        ),
      );
  }

  async markFailed(
    input: MeetingPlaybackJobData & { errorMessage: string; processingRunId: string },
  ) {
    const updated = await this.database
      .update(meetingSession)
      .set({
        processingError: input.errorMessage.slice(0, 1000),
        processingRunId: null,
        status: "processing-failed",
      })
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          eq(meetingSession.processingRunId, input.processingRunId),
          eq(meetingSession.status, "processing"),
        ),
      )
      .returning({ id: meetingSession.id });
    return updated.length > 0;
  }

  publish(input: Parameters<MeetingPlaybackProcessorPorts["publishPlayback"]>[0]) {
    const verifiedAt = new Date();
    return this.database.transaction(async (tx) => {
      const [claimed] = await tx
        .update(meetingSession)
        .set({ processingError: null, processingRunId: null, status: "ready" })
        .where(
          and(
            eq(meetingSession.id, input.meetingId),
            eq(meetingSession.organizationId, input.organizationId),
            eq(meetingSession.processingRunId, input.processingRunId),
            eq(meetingSession.status, "processing"),
          ),
        )
        .returning({ id: meetingSession.id });
      if (!claimed) {
        return false;
      }
      await tx
        .insert(meetingRecordingAsset)
        .values({
          contentType: input.contentType,
          durationMs: input.durationMs,
          fragmentCount: 0,
          id: `${input.meetingId}:playback`,
          meetingId: input.meetingId,
          sha256: input.sha256,
          sizeBytes: input.sizeBytes,
          status: "ready",
          storageKey: input.storageKey,
          track: "playback",
          uploadMode: "derived",
          verifiedAt,
        })
        .onConflictDoUpdate({
          set: {
            contentType: input.contentType,
            durationMs: input.durationMs,
            sha256: input.sha256,
            sizeBytes: input.sizeBytes,
            status: "ready",
            storageKey: input.storageKey,
            uploadMode: "derived",
            verifiedAt,
          },
          target: [meetingRecordingAsset.meetingId, meetingRecordingAsset.track],
        });
      return true;
    });
  }
}

export function createMeetingPlaybackInfrastructure(input: {
  queueProducer: BackgroundQueueProducerService;
  recovery: MeetingRecoveryCommands;
  repository: MeetingPlaybackRepository;
  storage: WorkloadObjectStorage;
}): MeetingPlaybackProcessorPorts {
  return createMeetingPlaybackProcessorPorts({
    buildPlaybackStorageKey: (job) => input.storage.buildPlaybackStorageKey(job),
    deletePlayback: (key) => input.storage.delete(key),
    downloadSource: (request) => input.storage.downloadToFile(request),
    enqueueTranscription: async (job) => {
      const recoverable = await input.recovery.listRecoverableMeetingTranscriptionJobs();
      const transcriptionJob = recoverable.find(
        (candidate) =>
          candidate.meetingId === job.meetingId && candidate.organizationId === job.organizationId,
      );
      if (transcriptionJob) {
        await input.queueProducer.enqueueMeetingTranscriptionJobs([transcriptionJob]);
      }
    },
    loadSource: (job) => input.repository.loadSource(job),
    markFailed: (job) => input.repository.markFailed(job),
    markProcessing: (job) => input.repository.markProcessing(job),
    publishPlayback: (job) => input.repository.publish(job),
    registerCleanupKey: (job) => input.repository.registerCleanupKey(job),
    removeCleanupKey: (job) => input.repository.removeCleanupKey(job),
    uploadPlayback: (request) => input.storage.putFile(request),
    verifyPlayback: (request) => input.storage.verify(request),
  });
}
