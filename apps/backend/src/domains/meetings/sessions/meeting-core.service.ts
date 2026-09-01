import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { meetingAuditLog, meetingSession } from "@arc/db-schema/schema";
import { and, eq } from "drizzle-orm";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import type { z } from "zod";
import type { updateMeetingMetadataSchema } from "./meeting.schemas.js";
import { rebuildMeetingSearchProjection } from "./meeting-search.service.js";

const LIBRARY_STATUSES = [
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;

type AccessRole = "administrator" | "editor" | "owner" | "viewer";

function administrator(role: string): boolean {
  return role === "owner" || role === "admin";
}

function processingState(status: string): "failed" | "processing" | "ready" {
  if (status === "ready") {
    return "ready";
  }
  if (status === "processing-failed") {
    return "failed";
  }
  return "processing";
}

interface AccessMeeting {
  accessGrants: { memberId: string; role: string }[];
  custodianId: string | null;
  ownerId: string;
  visibility: string;
}

function resolveAccessRole(
  meeting: AccessMeeting,
  actor: { memberId: string | null; memberRole: string; userId: string },
): AccessRole | null {
  if (administrator(actor.memberRole)) {
    return "administrator";
  }
  if ((meeting.custodianId ?? meeting.ownerId) === actor.userId) {
    return "owner";
  }
  const grant = actor.memberId
    ? meeting.accessGrants.find((candidate) => candidate.memberId === actor.memberId)
    : undefined;
  if (grant?.role === "editor") {
    return "editor";
  }
  if (grant?.role === "viewer" || meeting.visibility === "workspace") {
    return "viewer";
  }
  return null;
}

@Injectable()
export class MeetingCoreService {
  constructor(@Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort) {}

  private async actor(organizationId: string, userId: string, memberRole: string) {
    const activeMember = await this.database.query.member.findFirst({
      columns: { id: true },
      where: { organizationId, userId },
    });
    return { memberId: activeMember?.id ?? null, memberRole, userId };
  }

  async list(organizationId: string, userId: string, memberRole: string) {
    const actor = await this.actor(organizationId, userId, memberRole);
    const meetings = await this.database.query.meetingSession.findMany({
      orderBy: { savedAt: "desc" },
      where: { organizationId, status: { in: [...LIBRARY_STATUSES] } },
      with: { accessGrants: true, assets: true, owner: true },
    });
    const controllerIds = [
      ...new Set(meetings.map((meeting) => meeting.custodianId ?? meeting.ownerId)),
    ];
    const controllerMembers =
      controllerIds.length > 0
        ? await this.database.query.member.findMany({
            columns: { userId: true },
            where: { organizationId, userId: { in: controllerIds } },
          })
        : [];
    const memberControllerIds = new Set(
      controllerMembers.map((workspaceMember) => workspaceMember.userId),
    );
    const records = meetings.flatMap((meeting) => {
      if (!meeting.owner) {
        return [];
      }
      const accessRole = resolveAccessRole(meeting, actor);
      if (!accessRole) {
        return [];
      }
      const sources = meeting.assets.filter(
        (asset) => asset.track === "microphone" || asset.track === "system",
      );
      return [
        {
          accessRole,
          creator: {
            id: meeting.owner.id,
            image: meeting.owner.image,
            name: meeting.owner.name,
          },
          durationMs: Math.max(0, ...sources.map((asset) => asset.durationMs ?? 0)),
          id: meeting.id,
          processingState: processingState(meeting.status),
          recordingAvailable: meeting.assets.some(
            (asset) => asset.track === "playback" && asset.status === "ready",
          ),
          savedAt: meeting.savedAt.toISOString(),
          title: meeting.title,
          workspaceCustodied: !memberControllerIds.has(meeting.custodianId ?? meeting.ownerId),
        },
      ];
    });
    if (administrator(memberRole)) {
      await this.recordAudit({
        action: "meeting.library_accessed",
        actorId: userId,
        organizationId,
      });
    }
    return records;
  }

  async authorized(organizationId: string, userId: string, memberRole: string, meetingId: string) {
    const meeting = await this.database.query.meetingSession.findFirst({
      where: { id: meetingId, organizationId },
      with: { accessGrants: true, assets: true, custodian: true, owner: true },
    });
    if (!meeting) {
      return null;
    }
    const accessRole = resolveAccessRole(
      meeting,
      await this.actor(organizationId, userId, memberRole),
    );
    return accessRole ? { accessRole, meeting } : null;
  }

  async detail(organizationId: string, userId: string, memberRole: string, meetingId: string) {
    const authorized = await this.authorized(organizationId, userId, memberRole, meetingId);
    if (!authorized) {
      throw new NotFoundException("Meeting Session 不存在", {
        errorCode: "MEETING_NOT_FOUND",
      });
    }
    const { accessRole, meeting } = authorized;
    if (!meeting.owner) {
      throw new NotFoundException("Meeting Session 不存在", {
        errorCode: "MEETING_NOT_FOUND",
      });
    }
    if (accessRole === "administrator") {
      await this.recordAudit({
        action: "meeting.detail_accessed",
        actorId: userId,
        meetingId,
        organizationId,
      });
    }
    const sources = meeting.assets.filter(
      (asset) => asset.track === "microphone" || asset.track === "system",
    );
    const effectiveStatus =
      meeting.status === "trashed" ? (meeting.trashedFromStatus ?? "ready") : meeting.status;
    const controllerMember = await this.database.query.member.findFirst({
      columns: { id: true },
      where: { organizationId, userId: meeting.custodianId ?? meeting.ownerId },
    });
    return {
      accessRole,
      archived: meeting.status === "trashed",
      creator: { id: meeting.owner.id, image: meeting.owner.image, name: meeting.owner.name },
      durationMs: Math.max(0, ...sources.map((asset) => asset.durationMs ?? 0)),
      id: meeting.id,
      processingState: processingState(effectiveStatus),
      recordingAvailable: meeting.assets.some(
        (asset) => asset.track === "playback" && asset.status === "ready",
      ),
      savedAt: meeting.savedAt.toISOString(),
      startedAt: meeting.startedAt.toISOString(),
      title: meeting.title ?? "",
      verifiedAt: meeting.verifiedAt?.toISOString() ?? null,
      workspaceCustodied: !controllerMember,
    };
  }

  async rename(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    input: z.infer<typeof updateMeetingMetadataSchema>,
  ) {
    const authorized = await this.authorized(organizationId, userId, memberRole, meetingId);
    if (!authorized) {
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    if (!(authorized.accessRole === "administrator" || authorized.accessRole === "owner")) {
      throw new ForbiddenException("只有 Meeting Owner 或 Workspace 管理员可以修改会议名称", {
        errorCode: "MEETING_METADATA_FORBIDDEN",
      });
    }
    return this.database.transaction(async (tx) => {
      const [updated] = await tx
        .update(meetingSession)
        .set({ title: input.title })
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        )
        .returning({ title: meetingSession.title });
      if (!updated) {
        throw new NotFoundException("Meeting Session 不存在", {
          errorCode: "MEETING_NOT_FOUND",
        });
      }
      await tx.insert(meetingAuditLog).values({
        action: "meeting.metadata_updated",
        actorId: userId,
        detail: { title: input.title },
        id: randomUUID(),
        meetingId,
        organizationId,
      });
      await rebuildMeetingSearchProjection(tx, { meetingId, organizationId });
      return { title: updated.title ?? input.title };
    });
  }

  private async recordAudit(input: {
    action: string;
    actorId: string;
    meetingId?: string;
    organizationId: string;
  }) {
    await this.database.insert(meetingAuditLog).values({
      action: input.action,
      actorId: input.actorId,
      id: randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
  }
}
