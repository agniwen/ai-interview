/* oxlint-disable complexity, no-nested-ternary, require-await -- Lifecycle authorization, state transitions, and Promise ports are transactional invariants. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  meetingAuditLog,
  meetingRecruitingContext,
  meetingSearchProjection,
  meetingSession,
  member,
  user,
} from "@arc/db-schema/schema";
import { isMeetingPurgeQueueConfigured } from "@arc/meeting-processing-queue/meeting-purge";
import { MEETING_TRASH_RETENTION_MS } from "@arc/shared/meeting-recording";
import { and, asc, count, desc, eq, gt, ilike, isNotNull, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { BackgroundQueueProducerService } from "../../../background/background-queue-producer.service.js";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import type { purgeMeetingQuerySchema, trashedMeetingListQuerySchema } from "./meeting.schemas.js";
import { rebuildMeetingSearchProjection } from "./meeting-search.service.js";

const TRASHABLE = new Set([
  "uploading",
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
]);
const UPLOAD_LEASE_MS = 121 * 60 * 1000;
const UPLOAD_AUTHORIZATION_DRAIN_MS = 61 * 60 * 1000;

@Injectable()
export class MeetingLifecycleService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(BackgroundQueueProducerService)
    private readonly queueProducer: BackgroundQueueProducerService,
  ) {}

  private async member(
    tx: Parameters<Parameters<WorkspaceDatabasePort["transaction"]>[0]>[0],
    organizationId: string,
    userId: string,
  ) {
    const [row] = await tx
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)))
      .for("share")
      .limit(1);
    return row;
  }

  private authorized(
    meeting: { custodianId: string | null; ownerId: string },
    role: string | undefined,
    userId: string,
  ) {
    return Boolean(
      role &&
      role !== "noAccess" &&
      (role === "owner" || role === "admin" || (meeting.custodianId ?? meeting.ownerId) === userId),
    );
  }

  async trash(organizationId: string, userId: string, meetingId: string) {
    return this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          custodianId: meetingSession.custodianId,
          ownerId: meetingSession.ownerId,
          purgeAfter: meetingSession.purgeAfter,
          status: meetingSession.status,
        })
        .from(meetingSession)
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
      }
      const current = await this.member(tx, organizationId, userId);
      if (!this.authorized(meeting, current?.role, userId)) {
        throw new ForbiddenException("只有 Meeting Owner 或 Workspace 管理员可以归档", {
          errorCode: "MEETING_TRASH_FORBIDDEN",
        });
      }
      if (meeting.status === "purging") {
        throw new ConflictException("Meeting Session 正在永久清除", {
          errorCode: "MEETING_PURGING",
        });
      }
      if (meeting.status === "trashed" && meeting.purgeAfter) {
        return { purgeAfter: meeting.purgeAfter.toISOString(), state: "already-trashed" as const };
      }
      if (!TRASHABLE.has(meeting.status)) {
        throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
      }
      const now = new Date();
      const purgeAfter = new Date(now.getTime() + MEETING_TRASH_RETENTION_MS);
      await tx
        .update(meetingSession)
        .set({ purgeAfter, status: "trashed", trashedAt: now, trashedFromStatus: meeting.status })
        .where(eq(meetingSession.id, meetingId));
      await Promise.all([
        tx
          .delete(meetingRecruitingContext)
          .where(eq(meetingRecruitingContext.meetingId, meetingId)),
        tx.delete(meetingSearchProjection).where(eq(meetingSearchProjection.meetingId, meetingId)),
      ]);
      await tx.insert(meetingAuditLog).values({
        action: "meeting.trashed",
        actorId: userId,
        detail: { previousStatus: meeting.status, purgeAfter: purgeAfter.toISOString() },
        id: randomUUID(),
        meetingId,
        organizationId,
      });
      return { purgeAfter: purgeAfter.toISOString(), state: "trashed" as const };
    });
  }

  async listTrash(
    organizationId: string,
    userId: string,
    query: z.infer<typeof trashedMeetingListQuerySchema>,
  ) {
    const active = await this.database.query.member.findFirst({
      columns: { role: true },
      where: { organizationId, userId },
    });
    if (!active || active.role === "noAccess") {
      return { page: query.page, pageSize: query.pageSize, records: [], total: 0, totalPages: 1 };
    }
    const admin = active.role === "owner" || active.role === "admin";
    const where = and(
      eq(meetingSession.organizationId, organizationId),
      eq(meetingSession.status, "trashed"),
      isNotNull(meetingSession.purgeAfter),
      isNotNull(meetingSession.trashedAt),
      admin
        ? undefined
        : eq(
            sql<string>`coalesce(${meetingSession.custodianId}, ${meetingSession.ownerId})`,
            userId,
          ),
      query.search ? ilike(meetingSession.title, `%${query.search}%`) : undefined,
    );
    const [totalRow] = await this.database
      .select({ value: count() })
      .from(meetingSession)
      .where(where);
    const column =
      query.sortBy === "savedAt"
        ? meetingSession.savedAt
        : query.sortBy === "title"
          ? meetingSession.title
          : meetingSession.trashedAt;
    const direction = query.sortOrder === "asc" ? asc : desc;
    const rows = await this.database
      .select({
        creatorId: user.id,
        creatorImage: user.image,
        creatorName: user.name,
        id: meetingSession.id,
        purgeAfter: meetingSession.purgeAfter,
        savedAt: meetingSession.savedAt,
        title: meetingSession.title,
        trashedAt: meetingSession.trashedAt,
      })
      .from(meetingSession)
      .innerJoin(user, eq(user.id, meetingSession.ownerId))
      .where(where)
      .orderBy(direction(column), direction(meetingSession.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize);
    const total = Number(totalRow?.value ?? 0);
    return {
      page: query.page,
      pageSize: query.pageSize,
      records: rows.flatMap((row) =>
        row.purgeAfter && row.trashedAt
          ? [
              {
                creator: { id: row.creatorId, image: row.creatorImage, name: row.creatorName },
                id: row.id,
                purgeAfter: row.purgeAfter.toISOString(),
                savedAt: row.savedAt.toISOString(),
                title: row.title,
                trashedAt: row.trashedAt.toISOString(),
              },
            ]
          : [],
      ),
      total,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    };
  }

  async restore(organizationId: string, userId: string, meetingId: string) {
    return this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('meeting-direct-upload-capacity'))`,
      );
      const [meeting] = await tx
        .select({
          custodianId: meetingSession.custodianId,
          ownerId: meetingSession.ownerId,
          purgeAfter: meetingSession.purgeAfter,
          status: meetingSession.status,
          trashedFromStatus: meetingSession.trashedFromStatus,
        })
        .from(meetingSession)
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        )
        .for("update")
        .limit(1);
      if (!meeting || meeting.status !== "trashed" || !meeting.trashedFromStatus) {
        throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
      }
      const current = await this.member(tx, organizationId, userId);
      if (!this.authorized(meeting, current?.role, userId)) {
        throw new ForbiddenException("只有 Meeting Owner 或 Workspace 管理员可以恢复会议", {
          errorCode: "MEETING_RESTORE_FORBIDDEN",
        });
      }
      const now = new Date();
      if (!meeting.purgeAfter || meeting.purgeAfter <= now) {
        throw new ConflictException("Meeting Session 已超过七天恢复期限", {
          errorCode: "MEETING_RESTORE_EXPIRED",
        });
      }
      if (meeting.trashedFromStatus === "uploading") {
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
          throw new HttpException(
            {
              errorCode: "meeting-upload-capacity-exhausted",
              message: "录音上传容量已满，Meeting Session 仍保留在归档记录中",
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
      }
      await tx
        .update(meetingSession)
        .set({
          purgeAfter: null,
          purgeInitialSweepCompletedAt: null,
          status: meeting.trashedFromStatus,
          trashedAt: null,
          trashedFromStatus: null,
          uploadLeaseExpiresAt:
            meeting.trashedFromStatus === "uploading"
              ? new Date(now.getTime() + UPLOAD_LEASE_MS)
              : null,
        })
        .where(eq(meetingSession.id, meetingId));
      await rebuildMeetingSearchProjection(tx, { meetingId, organizationId });
      await tx.insert(meetingAuditLog).values({
        action: "meeting.restored",
        actorId: userId,
        detail: { restoredStatus: meeting.trashedFromStatus },
        id: randomUUID(),
        meetingId,
        organizationId,
      });
      return { state: "restored" as const };
    });
  }

  async purge(
    organizationId: string,
    userId: string,
    meetingId: string,
    query: z.infer<typeof purgeMeetingQuerySchema>,
  ) {
    const result = await this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({
          custodianId: meetingSession.custodianId,
          ownerId: meetingSession.ownerId,
          status: meetingSession.status,
          trashedAt: meetingSession.trashedAt,
          trashedFromStatus: meetingSession.trashedFromStatus,
        })
        .from(meetingSession)
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        )
        .for("update")
        .limit(1);
      if (!meeting) {
        return "not-found" as const;
      }
      const current = await this.member(tx, organizationId, userId);
      if (!this.authorized(meeting, current?.role, userId)) {
        throw new ForbiddenException("只有 Meeting Owner 或 Workspace 管理员可以永久清除会议", {
          errorCode: "MEETING_PURGE_FORBIDDEN",
        });
      }
      if (meeting.status === "purging") {
        return "purging" as const;
      }
      if (meeting.status !== "trashed" && !TRASHABLE.has(meeting.status)) {
        return "not-found" as const;
      }
      const now = new Date();
      const purgeAfter = new Date(now.getTime() + UPLOAD_AUTHORIZATION_DRAIN_MS);
      await tx
        .update(meetingSession)
        .set({
          purgeAfter,
          purgeClaimToken: null,
          purgeInitialSweepCompletedAt: null,
          purgeLeaseExpiresAt: null,
          status: "purging",
          trashedAt: meeting.trashedAt ?? now,
          trashedFromStatus: meeting.trashedFromStatus ?? meeting.status,
        })
        .where(eq(meetingSession.id, meetingId));
      await Promise.all([
        tx
          .delete(meetingRecruitingContext)
          .where(eq(meetingRecruitingContext.meetingId, meetingId)),
        tx.delete(meetingSearchProjection).where(eq(meetingSearchProjection.meetingId, meetingId)),
      ]);
      await tx.insert(meetingAuditLog).values({
        action: "meeting.purge_requested",
        actorId: userId,
        detail: {
          purgeAfter: purgeAfter.toISOString(),
          requestingDeviceLocalRecoveryCleanup: query.localRecoveryCleanup,
        },
        id: randomUUID(),
        meetingId,
        organizationId,
      });
      return "purging" as const;
    });
    if (result === "purging" && isMeetingPurgeQueueConfigured(rawBackendEnvironment)) {
      try {
        await this.queueProducer.enqueueMeetingPurgeJobs([{ meetingId, organizationId }]);
      } catch (error) {
        console.error("[meeting-purge] enqueue failed; reconciliation will retry", {
          errorName: error instanceof Error ? error.name : "UnknownError",
          meetingId,
        });
      }
    }
  }
}
