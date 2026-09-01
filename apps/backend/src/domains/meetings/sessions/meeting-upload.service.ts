/* oxlint-disable require-await, unicorn/no-await-expression-member -- Direct upload leases, multipart plans, object verification, and async ports form one protocol. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { meetingRecordingAsset, meetingSession } from "@arc/db-schema/schema";
import { isMeetingProcessingQueueConfigured } from "@arc/meeting-processing-queue/meeting-playback";
import { formatDefaultMeetingTitle } from "@arc/shared/utils/time";
import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { BackgroundQueueProducerService } from "../../../background/background-queue-producer.service.js";
import {
  WORKSPACE_DATABASE_PORT,
  WORKSPACE_OBJECT_STORAGE_PORT,
} from "../../../infrastructure/workspace/workspace.ports.js";
import type {
  WorkspaceDatabasePort,
  WorkspaceObjectStoragePort,
} from "../../../infrastructure/workspace/workspace.ports.js";
import { rebuildMeetingSearchProjection } from "./meeting-search.service.js";
import type {
  completeSmallSavedMeetingSchema,
  createMultipartSavedMeetingSchema,
  createSmallSavedMeetingSchema,
} from "./meeting.schemas.js";

const VERIFIED = new Set(["workspace-verified", "processing", "processing-failed", "ready"]);
const LEASE_MS = 121 * 60 * 1000;

function normalizedEtag(value: string) {
  return value.replaceAll('"', "").toLowerCase();
}
function multipartEtag(parts: { md5Base64: string }[]) {
  return `${createHash("md5")
    .update(Buffer.concat(parts.map((part) => Buffer.from(part.md5Base64, "base64"))))
    .digest("hex")}-${parts.length}`;
}

@Injectable()
export class MeetingUploadService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_OBJECT_STORAGE_PORT) private readonly storage: WorkspaceObjectStoragePort,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
  ) {}

  private capacityError() {
    return new HttpException(
      {
        errorCode: "meeting-upload-capacity-exhausted",
        message: "录音上传容量已满，本地 Meeting Recording 已保留",
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private async renew(organizationId: string, ownerId: string, meetingId: string) {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('meeting-direct-upload-capacity'))`,
      );
      const now = new Date();
      const [meeting] = await tx
        .select({ uploadLeaseExpiresAt: meetingSession.uploadLeaseExpiresAt })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, meetingId),
            eq(meetingSession.organizationId, organizationId),
            eq(meetingSession.ownerId, ownerId),
            eq(meetingSession.status, "uploading"),
          ),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        return false;
      }
      if (!(meeting.uploadLeaseExpiresAt && meeting.uploadLeaseExpiresAt > now)) {
        const [active] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(meetingSession)
          .where(
            and(gt(meetingSession.uploadLeaseExpiresAt, now), ne(meetingSession.id, meetingId)),
          );
        const limit =
          Number.parseInt(rawBackendEnvironment.MEETING_DIRECT_UPLOAD_CONCURRENCY ?? "100", 10) ||
          100;
        if ((active?.count ?? 0) >= limit) {
          return false;
        }
      }
      const rows = await tx
        .update(meetingSession)
        .set({ uploadLeaseExpiresAt: new Date(now.getTime() + LEASE_MS) })
        .where(
          and(
            eq(meetingSession.id, meetingId),
            eq(meetingSession.organizationId, organizationId),
            eq(meetingSession.ownerId, ownerId),
            eq(meetingSession.status, "uploading"),
          ),
        )
        .returning({ id: meetingSession.id });
      return rows.length > 0;
    });
  }

  private async createOrLoad(
    input:
      | z.infer<typeof createSmallSavedMeetingSchema>
      | z.infer<typeof createMultipartSavedMeetingSchema>,
    organizationId: string,
    ownerId: string,
    multipart: boolean,
  ) {
    const assets = await Promise.all(
      input.assets.map(async (asset) => ({
        ...asset,
        key: await this.storage.buildMeetingRecordingKey({
          meetingId: input.id,
          organizationId,
          track: asset.track,
        }),
        parts: "parts" in asset ? asset.parts : null,
      })),
    );
    const result = await this.database.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.id}))`);
      if (
        await tx.query.meetingPurgeTombstone.findFirst({
          columns: { meetingId: true },
          where: { meetingId: input.id },
        })
      ) {
        throw new ConflictException("Meeting Session 已被永久清除", {
          errorCode: "meeting-purged",
        });
      }
      const existing = await tx.query.meetingSession.findFirst({
        where: { id: input.id },
        with: { assets: true },
      });
      if (existing) {
        if (
          existing.organizationId !== organizationId ||
          existing.ownerId !== ownerId ||
          existing.manifestSha256 !== input.manifestSha256
        ) {
          throw new ConflictException("Meeting Session 已绑定另一份本地录音清单", {
            errorCode: "MEETING_UPLOAD_CONFLICT",
          });
        }
        if (existing.status === "trashed" || existing.status === "purging") {
          throw new ConflictException("Meeting Session 已归档或正在永久清除", {
            errorCode: "MEETING_LIFECYCLE_UNAVAILABLE",
          });
        }
        return { created: false, meeting: existing };
      }
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('meeting-direct-upload-capacity'))`,
      );
      const now = new Date();
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(meetingSession)
        .where(gt(meetingSession.uploadLeaseExpiresAt, now));
      const limit =
        Number.parseInt(rawBackendEnvironment.MEETING_DIRECT_UPLOAD_CONCURRENCY ?? "100", 10) ||
        100;
      if ((active?.count ?? 0) >= limit) {
        throw this.capacityError();
      }
      await tx.insert(meetingSession).values({
        id: input.id,
        liveTranscriptDraft: input.liveTranscriptDraft ?? null,
        manifestSha256: input.manifestSha256,
        organizationId,
        ownerId,
        savedAt: new Date(input.savedAt),
        startedAt: new Date(input.startedAt),
        status: "uploading",
        title: input.title ?? formatDefaultMeetingTitle(input.startedAt),
        uploadLeaseExpiresAt: new Date(now.getTime() + LEASE_MS),
      });
      await tx.insert(meetingRecordingAsset).values(
        assets.map((asset) => ({
          contentType: asset.contentType,
          durationMs: asset.durationMs,
          fragmentCount: asset.fragmentCount,
          id: `${input.id}:${asset.track}`,
          meetingId: input.id,
          multipartParts: asset.parts,
          segments: asset.segments ?? null,
          sha256: asset.sha256,
          sizeBytes: asset.sizeBytes,
          status: "uploading",
          storageKey: asset.key,
          track: asset.track,
          uploadMode: multipart ? "multipart" : "single",
        })),
      );
      await rebuildMeetingSearchProjection(tx, { meetingId: input.id, organizationId });
      const meeting = await tx.query.meetingSession.findFirst({
        where: { id: input.id },
        with: { assets: true },
      });
      if (!meeting) {
        throw new Error("Meeting Session 创建失败");
      }
      return { created: true, meeting };
    });
    return result;
  }

  private async verifiedResponse(
    meeting: { id: string; recoveryCopyDeleteAfter: Date | null; status: string },
    organizationId: string,
    ownerId: string,
    created: boolean,
  ) {
    const deadline =
      meeting.recoveryCopyDeleteAfter ??
      (await this.markVerified(organizationId, ownerId, meeting.id));
    if (
      (meeting.status === "workspace-verified" || meeting.status === "processing") &&
      isMeetingProcessingQueueConfigured(rawBackendEnvironment)
    ) {
      try {
        await this.queueProducer.enqueueMeetingPlaybackJobs([
          { meetingId: meeting.id, organizationId },
        ]);
      } catch (error) {
        console.error("[meeting-playback] enqueue failed; startup recovery will retry", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          meetingId: meeting.id,
        });
      }
    }
    return {
      created,
      meetingId: meeting.id,
      recoveryCopyDeleteAfter: deadline.toISOString(),
      state: "workspace-verified" as const,
      uploads: [],
    };
  }

  async create(
    organizationId: string,
    ownerId: string,
    input: z.infer<typeof createSmallSavedMeetingSchema>,
  ) {
    const { created, meeting } = await this.createOrLoad(input, organizationId, ownerId, false);
    if (VERIFIED.has(meeting.status)) {
      return this.verifiedResponse(meeting, organizationId, ownerId, created);
    }
    const uploads = await Promise.all(
      meeting.assets
        .filter((asset) => asset.track === "microphone" || asset.track === "system")
        .map(async (asset) => {
          const signed = await this.storage.presignMeetingPut({
            contentType: asset.contentType,
            key: asset.storageKey,
            sha256: asset.sha256,
            sizeBytes: asset.sizeBytes,
          });
          return {
            contentType: asset.contentType,
            expiresAt: signed.expiresAt.toISOString(),
            headers: signed.headers,
            method: "PUT" as const,
            sizeBytes: asset.sizeBytes,
            // SAFETY: createOrLoad only materializes the two validated recording tracks.
            track: asset.track as "microphone" | "system",
            url: signed.url,
          };
        }),
    );
    if (!(await this.renew(organizationId, ownerId, meeting.id))) {
      throw this.capacityError();
    }
    return {
      created,
      meetingId: meeting.id,
      recoveryCopyDeleteAfter: null,
      state: "uploading" as const,
      uploads,
    };
  }

  async createMultipart(
    organizationId: string,
    ownerId: string,
    input: z.infer<typeof createMultipartSavedMeetingSchema>,
  ) {
    const { created, meeting: initial } = await this.createOrLoad(
      input,
      organizationId,
      ownerId,
      true,
    );
    if (VERIFIED.has(initial.status)) {
      return this.verifiedResponse(initial, organizationId, ownerId, created);
    }
    const expected = new Map(input.assets.map((asset) => [asset.track, asset]));
    const sources = initial.assets.filter(
      (asset) => asset.track === "microphone" || asset.track === "system",
    );
    if (
      sources.length !== 2 ||
      sources.some((asset) => {
        // SAFETY: sources is filtered immediately above to microphone/system assets only.
        const plan = expected.get(asset.track as "microphone" | "system");
        return (
          !plan ||
          asset.uploadMode !== "multipart" ||
          asset.contentType !== plan.contentType ||
          asset.sizeBytes !== plan.sizeBytes ||
          asset.sha256 !== plan.sha256 ||
          JSON.stringify(asset.multipartParts) !== JSON.stringify(plan.parts)
        );
      })
    ) {
      throw new ConflictException("Meeting Session multipart 保存计划不一致", {
        errorCode: "MEETING_MULTIPART_PLAN_CONFLICT",
      });
    }
    for (const asset of sources) {
      if (!asset.multipartUploadId) {
        const uploadId = await this.storage.createMeetingMultipart({
          contentType: asset.contentType,
          key: asset.storageKey,
          sha256: asset.sha256,
        });
        const updated = await this.database
          .update(meetingRecordingAsset)
          .set({ multipartUploadId: uploadId })
          .where(
            and(
              eq(meetingRecordingAsset.id, asset.id),
              isNull(meetingRecordingAsset.multipartUploadId),
            ),
          )
          .returning({ id: meetingRecordingAsset.id });
        if (updated.length === 0) {
          await this.storage.abortMeetingMultipart({ key: asset.storageKey, uploadId });
        }
      }
    }
    const meeting = await this.database.query.meetingSession.findFirst({
      where: { id: initial.id },
      with: { assets: true },
    });
    if (!meeting) {
      throw new ConflictException("Meeting Session multipart 保存计划不存在", {
        errorCode: "MEETING_MULTIPART_PLAN_MISSING",
      });
    }
    const nested = await Promise.all(
      meeting.assets
        .filter((asset) => asset.track === "microphone" || asset.track === "system")
        .map(async (asset) => {
          if (!(asset.multipartUploadId && asset.multipartParts)) {
            throw new Error("Meeting Session multipart 保存计划不完整");
          }
          const object = await this.storage.headMeetingObject(asset.storageKey);
          if (
            object?.etag &&
            object.contentLength === asset.sizeBytes &&
            object.contentType === asset.contentType &&
            object.sha256 === asset.sha256 &&
            normalizedEtag(object.etag) === multipartEtag(asset.multipartParts)
          ) {
            return [];
          }
          const confirmed = new Map(
            (
              await this.storage.listMeetingMultipartParts({
                key: asset.storageKey,
                uploadId: asset.multipartUploadId,
              })
            ).map((part) => [part.partNumber, part]),
          );
          return Promise.all(
            asset.multipartParts.map(async (part) => {
              const existing = confirmed.get(part.partNumber);
              const expectedEtag = Buffer.from(part.md5Base64, "base64").toString("hex");
              if (
                existing?.sizeBytes === part.sizeBytes &&
                normalizedEtag(existing.etag) === expectedEtag
              ) {
                return null;
              }
              const signed = await this.storage.presignMeetingPart({
                key: asset.storageKey,
                md5Base64: part.md5Base64,
                partNumber: part.partNumber,
                sizeBytes: part.sizeBytes,
                // SAFETY: multipart asset validation above requires a non-empty upload id.
                uploadId: asset.multipartUploadId as string,
              });
              return {
                expiresAt: signed.expiresAt.toISOString(),
                headers: signed.headers,
                method: "PUT" as const,
                offsetBytes: part.offsetBytes,
                partNumber: part.partNumber,
                sizeBytes: part.sizeBytes,
                // SAFETY: multipart sources are filtered to microphone/system tracks.
                track: asset.track as "microphone" | "system",
                url: signed.url,
              };
            }),
          );
        }),
    );
    if (!(await this.renew(organizationId, ownerId, meeting.id))) {
      throw this.capacityError();
    }
    return {
      created,
      meetingId: meeting.id,
      recoveryCopyDeleteAfter: null,
      state: "uploading" as const,
      uploads: nested.flatMap((parts) => parts.filter((part) => part !== null)),
    };
  }

  async heartbeat(organizationId: string, ownerId: string, meetingId: string) {
    if (!(await this.renew(organizationId, ownerId, meetingId))) {
      throw new ConflictException("录音上传租约已失效，本地 Meeting Recording 已保留", {
        errorCode: "MEETING_UPLOAD_LEASE_EXPIRED",
      });
    }
  }

  private async markVerified(organizationId: string, ownerId: string, meetingId: string) {
    const verifiedAt = new Date();
    const candidate = new Date(verifiedAt.getTime() + 24 * 60 * 60 * 1000);
    const deadline = await this.database.transaction(async (tx) => {
      await tx
        .update(meetingRecordingAsset)
        .set({ status: "ready", verifiedAt })
        .where(eq(meetingRecordingAsset.meetingId, meetingId));
      const [updated] = await tx
        .update(meetingSession)
        .set({
          processingError: null,
          processingRunId: null,
          recoveryCopyDeleteAfter: sql`coalesce(${meetingSession.recoveryCopyDeleteAfter}, ${candidate.toISOString()}::timestamptz)`,
          status: "processing",
          uploadLeaseExpiresAt: null,
          verifiedAt,
        })
        .where(
          and(
            eq(meetingSession.id, meetingId),
            eq(meetingSession.organizationId, organizationId),
            eq(meetingSession.ownerId, ownerId),
          ),
        )
        .returning({ recoveryCopyDeleteAfter: meetingSession.recoveryCopyDeleteAfter });
      return updated?.recoveryCopyDeleteAfter;
    });
    if (!deadline) {
      throw new Error("Meeting Session 验证状态未能持久化");
    }
    return deadline;
  }

  async complete(
    organizationId: string,
    ownerId: string,
    meetingId: string,
    input: z.infer<typeof completeSmallSavedMeetingSchema>,
  ) {
    const meeting = await this.database.query.meetingSession.findFirst({
      where: { id: meetingId },
      with: { assets: true },
    });
    if (!meeting) {
      if (
        await this.database.query.meetingPurgeTombstone.findFirst({
          columns: { meetingId: true },
          where: { meetingId },
        })
      ) {
        throw new ConflictException("Meeting Session 已被永久清除", {
          errorCode: "meeting-purged",
        });
      }
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    if (
      meeting.organizationId !== organizationId ||
      meeting.ownerId !== ownerId ||
      meeting.manifestSha256 !== input.manifestSha256
    ) {
      throw new ConflictException("Meeting Session 保存身份不匹配", {
        errorCode: "MEETING_UPLOAD_IDENTITY_CONFLICT",
      });
    }
    if (meeting.status === "trashed" || meeting.status === "purging") {
      throw new ConflictException("Meeting Session 已归档或正在永久清除", {
        errorCode: "MEETING_LIFECYCLE_UNAVAILABLE",
      });
    }
    if (VERIFIED.has(meeting.status)) {
      const result = await this.verifiedResponse(meeting, organizationId, ownerId, false);
      return {
        meetingId: result.meetingId,
        recoveryCopyDeleteAfter: result.recoveryCopyDeleteAfter,
        state: result.state,
      };
    }
    const sources = meeting.assets.filter(
      (asset) => asset.track === "microphone" || asset.track === "system",
    );
    if (sources.length !== 2) {
      throw new ConflictException("Meeting Session 音轨不完整", {
        errorCode: "MEETING_SOURCE_INCOMPLETE",
      });
    }
    const verified = await Promise.all(
      sources.map(async (asset) => {
        if (asset.uploadMode === "multipart") {
          if (!(asset.multipartParts && asset.multipartUploadId)) {
            return false;
          }
          let object = await this.storage.headMeetingObject(asset.storageKey);
          const matches = () =>
            Boolean(
              object?.etag &&
              object.contentLength === asset.sizeBytes &&
              object.contentType === asset.contentType &&
              object.sha256 === asset.sha256 &&
              normalizedEtag(object.etag) === multipartEtag(asset.multipartParts ?? []),
            );
          if (matches()) {
            return true;
          }
          const uploaded = await this.storage.listMeetingMultipartParts({
            key: asset.storageKey,
            uploadId: asset.multipartUploadId,
          });
          const byNumber = new Map(uploaded.map((part) => [part.partNumber, part]));
          const parts = asset.multipartParts.map((part) => {
            const found = byNumber.get(part.partNumber);
            return found &&
              found.sizeBytes === part.sizeBytes &&
              normalizedEtag(found.etag) === Buffer.from(part.md5Base64, "base64").toString("hex")
              ? { etag: found.etag, partNumber: part.partNumber }
              : null;
          });
          if (
            uploaded.length !== asset.multipartParts.length ||
            parts.some((part) => part === null)
          ) {
            return false;
          }
          await this.storage.completeMeetingMultipart({
            key: asset.storageKey,
            parts: parts.filter((part) => part !== null),
            uploadId: asset.multipartUploadId,
          });
          object = await this.storage.headMeetingObject(asset.storageKey);
          return matches();
        }
        const object = await this.storage.headMeetingObject(asset.storageKey);
        return Boolean(
          object &&
          object.checksumSha256 === Buffer.from(asset.sha256, "hex").toString("base64") &&
          object.contentLength === asset.sizeBytes &&
          object.contentType === asset.contentType &&
          object.sha256 === asset.sha256,
        );
      }),
    );
    if (verified.some((value) => !value)) {
      throw new ConflictException("源音轨尚未通过对象完整性校验", {
        errorCode: "MEETING_SOURCE_VERIFICATION_FAILED",
      });
    }
    const deadline = await this.markVerified(organizationId, ownerId, meetingId);
    if (isMeetingProcessingQueueConfigured(rawBackendEnvironment)) {
      try {
        await this.queueProducer.enqueueMeetingPlaybackJobs([{ meetingId, organizationId }]);
      } catch (error) {
        console.error("[meeting-playback] enqueue failed; startup recovery will retry", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          meetingId,
        });
      }
    }
    return {
      meetingId,
      recoveryCopyDeleteAfter: deadline.toISOString(),
      state: "workspace-verified" as const,
    };
  }
}
