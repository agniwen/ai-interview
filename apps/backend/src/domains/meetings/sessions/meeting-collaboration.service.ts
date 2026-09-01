/* oxlint-disable typescript/consistent-type-imports -- Nest reads MeetingCoreService from emitted constructor metadata. */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  meetingAccessGrant,
  meetingAuditLog,
  meetingNote,
  meetingSession,
  member,
  user,
} from "@arc/db-schema/schema";
import { and, asc, eq, inArray, sql, sum } from "drizzle-orm";
import type { z } from "zod";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import { MeetingCoreService } from "./meeting-core.service.js";
import { rebuildMeetingSearchProjection } from "./meeting-search.service.js";
import type {
  createMeetingNoteSchema,
  reassignMeetingOwnerSchema,
  updateMeetingNoteSchema,
  updateMeetingShareSchema,
} from "./meeting.schemas.js";

const MAX_NOTE_COUNT = 200;
const MAX_NOTE_CHARS = 1_000_000;

@Injectable()
export class MeetingCollaborationService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    private readonly core: MeetingCoreService,
  ) {}

  private async required(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
  ) {
    const result = await this.core.authorized(organizationId, userId, memberRole, meetingId);
    if (!result) {
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    return result;
  }

  private serializeNote(note: typeof meetingNote.$inferSelect, accessRole: string, userId: string) {
    const isAuthor = note.authorId === userId;
    const canRevise = accessRole !== "viewer";
    return {
      author: { id: note.authorId, name: note.authorName },
      body: note.body,
      canDelete: accessRole === "administrator" || (isAuthor && canRevise),
      canEdit: canRevise,
      createdAt: note.createdAt.toISOString(),
      id: note.id,
      meetingTimeMs: note.meetingTimeMs,
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  async listNotes(organizationId: string, userId: string, memberRole: string, meetingId: string) {
    const { accessRole } = await this.required(organizationId, userId, memberRole, meetingId);
    const notes = await this.database
      .select()
      .from(meetingNote)
      .where(
        and(eq(meetingNote.meetingId, meetingId), eq(meetingNote.organizationId, organizationId)),
      )
      .orderBy(asc(meetingNote.meetingTimeMs), asc(meetingNote.createdAt));
    return notes.map((note) => this.serializeNote(note, accessRole, userId));
  }

  async createNote(
    organizationId: string,
    userId: string,
    userName: string,
    memberRole: string,
    meetingId: string,
    input: z.infer<typeof createMeetingNoteSchema>,
  ) {
    const { accessRole, meeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    if (accessRole === "viewer") {
      throw new ForbiddenException("无权创建 Meeting Note", {
        errorCode: "MEETING_NOTE_FORBIDDEN",
      });
    }
    const durationMs = Math.max(
      0,
      ...meeting.assets
        .filter((asset) => asset.track === "microphone" || asset.track === "system")
        .map((asset) => asset.durationMs ?? 0),
    );
    if (input.meetingTimeMs > durationMs) {
      throw new BadRequestException("Meeting Note 时间超出录音时长", {
        errorCode: "MEETING_NOTE_INVALID_TIME",
      });
    }
    const created = await this.database.transaction(async (tx) => {
      await tx
        .select({ id: meetingSession.id })
        .from(meetingSession)
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        )
        .for("update");
      const [stats] = await tx
        .select({
          characters: sum(sql<number>`char_length(${meetingNote.body})`),
          count: sql<number>`count(*)`,
        })
        .from(meetingNote)
        .where(
          and(eq(meetingNote.meetingId, meetingId), eq(meetingNote.organizationId, organizationId)),
        );
      if (
        Number(stats?.count ?? 0) >= MAX_NOTE_COUNT ||
        Number(stats?.characters ?? 0) + input.body.length > MAX_NOTE_CHARS
      ) {
        throw new ConflictException("Meeting Note 数量或总文字长度已达到上限", {
          errorCode: "MEETING_NOTE_LIMIT_EXCEEDED",
        });
      }
      const [row] = await tx
        .insert(meetingNote)
        .values({
          authorId: userId,
          authorName: userName,
          body: input.body,
          id: randomUUID(),
          meetingId,
          meetingTimeMs: input.meetingTimeMs,
          organizationId,
        })
        .returning();
      await rebuildMeetingSearchProjection(tx, { meetingId, organizationId });
      return row;
    });
    if (!created) {
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    return this.serializeNote(created, accessRole, userId);
  }

  async updateNote(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    noteId: string,
    input: z.infer<typeof updateMeetingNoteSchema>,
  ) {
    const { accessRole, meeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    if (accessRole === "viewer") {
      throw new ForbiddenException("只能修改自己的 Meeting Note", {
        errorCode: "MEETING_NOTE_FORBIDDEN",
      });
    }
    const durationMs = Math.max(
      0,
      ...meeting.assets
        .filter((asset) => asset.track === "microphone" || asset.track === "system")
        .map((asset) => asset.durationMs ?? 0),
    );
    if (input.meetingTimeMs !== undefined && input.meetingTimeMs > durationMs) {
      throw new BadRequestException("Meeting Note 时间超出录音时长", {
        errorCode: "MEETING_NOTE_INVALID_TIME",
      });
    }
    const updated = await this.database.transaction(async (tx) => {
      const [row] = await tx
        .update(meetingNote)
        .set(input)
        .where(
          and(
            eq(meetingNote.id, noteId),
            eq(meetingNote.meetingId, meetingId),
            eq(meetingNote.organizationId, organizationId),
          ),
        )
        .returning();
      if (row) {
        await rebuildMeetingSearchProjection(tx, { meetingId, organizationId });
      }
      return row;
    });
    if (!updated) {
      throw new ForbiddenException("只能修改自己的 Meeting Note", {
        errorCode: "MEETING_NOTE_FORBIDDEN",
      });
    }
    return this.serializeNote(updated, accessRole, userId);
  }

  async deleteNote(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    noteId: string,
  ) {
    const { accessRole } = await this.required(organizationId, userId, memberRole, meetingId);
    if (accessRole === "viewer") {
      throw new ForbiddenException("只能删除自己的 Meeting Note", {
        errorCode: "MEETING_NOTE_FORBIDDEN",
      });
    }
    const deleted = await this.database.transaction(async (tx) => {
      const [row] = await tx
        .delete(meetingNote)
        .where(
          and(
            eq(meetingNote.id, noteId),
            eq(meetingNote.meetingId, meetingId),
            eq(meetingNote.organizationId, organizationId),
            accessRole === "administrator" ? undefined : eq(meetingNote.authorId, userId),
          ),
        )
        .returning({ id: meetingNote.id });
      if (row) {
        await rebuildMeetingSearchProjection(tx, { meetingId, organizationId });
      }
      return row;
    });
    if (!deleted) {
      throw new ForbiddenException("只能删除自己的 Meeting Note", {
        errorCode: "MEETING_NOTE_FORBIDDEN",
      });
    }
  }

  async getShare(organizationId: string, userId: string, memberRole: string, meetingId: string) {
    const { accessRole, meeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    if (!(accessRole === "administrator" || accessRole === "owner")) {
      throw new ForbiddenException("无权管理会议分享", {
        errorCode: "MEETING_SHARE_FORBIDDEN",
      });
    }
    const grants = await this.database
      .select({
        image: user.image,
        name: user.name,
        role: meetingAccessGrant.role,
        userId: member.userId,
      })
      .from(meetingAccessGrant)
      .innerJoin(
        member,
        and(eq(member.id, meetingAccessGrant.memberId), eq(member.organizationId, organizationId)),
      )
      .innerJoin(user, eq(user.id, member.userId))
      .where(
        and(
          eq(meetingAccessGrant.meetingId, meetingId),
          eq(meetingAccessGrant.organizationId, organizationId),
        ),
      )
      .orderBy(asc(user.name));
    const controllerId = meeting.custodianId ?? meeting.ownerId;
    const controller = meeting.custodian ?? meeting.owner;
    const currentControllerMember = await this.database.query.member.findFirst({
      columns: { id: true },
      where: { organizationId, userId: controllerId },
    });
    if (!controller) {
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    return {
      grants: grants.flatMap((grant) =>
        grant.role === "editor" || grant.role === "viewer"
          ? [
              {
                member: { id: grant.userId, image: grant.image, name: grant.name },
                role: grant.role,
              },
            ]
          : [],
      ),
      owner: { id: controller.id, image: controller.image, name: controller.name },
      visibility: meeting.visibility === "workspace" ? "workspace" : "restricted",
      workspaceCustodied: !currentControllerMember,
    };
  }

  async updateShare(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    input: z.infer<typeof updateMeetingShareSchema>,
  ) {
    const { accessRole, meeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    if (!(accessRole === "administrator" || accessRole === "owner")) {
      throw new ForbiddenException("无权管理会议分享", {
        errorCode: "MEETING_SHARE_FORBIDDEN",
      });
    }
    const controllerId = meeting.custodianId ?? meeting.ownerId;
    if (input.grants.some((grant) => grant.userId === controllerId)) {
      throw new BadRequestException("分享成员必须属于当前 Workspace", {
        errorCode: "MEETING_SHARE_INVALID_MEMBERS",
      });
    }
    await this.database.transaction(async (tx) => {
      const members = input.grants.length
        ? await tx
            .select({ id: member.id, userId: member.userId })
            .from(member)
            .where(
              and(
                eq(member.organizationId, organizationId),
                inArray(
                  member.userId,
                  input.grants.map((grant) => grant.userId),
                ),
              ),
            )
        : [];
      if (members.length !== input.grants.length) {
        throw new BadRequestException("分享成员必须属于当前 Workspace", {
          errorCode: "MEETING_SHARE_INVALID_MEMBERS",
        });
      }
      await tx
        .delete(meetingAccessGrant)
        .where(
          and(
            eq(meetingAccessGrant.meetingId, meetingId),
            eq(meetingAccessGrant.organizationId, organizationId),
          ),
        );
      if (input.grants.length > 0) {
        const memberIds = new Map(
          members.map((workspaceMember) => [workspaceMember.userId, workspaceMember.id]),
        );
        await tx.insert(meetingAccessGrant).values(
          input.grants.map((grant) => ({
            createdBy: userId,
            id: randomUUID(),
            meetingId,
            memberId: memberIds.get(grant.userId) ?? "",
            organizationId,
            role: grant.role,
          })),
        );
      }
      await tx
        .update(meetingSession)
        .set({ visibility: input.visibility })
        .where(
          and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
        );
      await tx.insert(meetingAuditLog).values({
        action: "meeting.share_updated",
        actorId: userId,
        detail: input,
        id: randomUUID(),
        meetingId,
        organizationId,
      });
    });
    return { updated: true as const };
  }

  async reassignOwner(
    organizationId: string,
    userId: string,
    memberRole: string,
    meetingId: string,
    input: z.infer<typeof reassignMeetingOwnerSchema>,
  ) {
    const { accessRole, meeting } = await this.required(
      organizationId,
      userId,
      memberRole,
      meetingId,
    );
    if (accessRole !== "administrator") {
      throw new ForbiddenException("只有 Workspace Administrator 可以重新分配会议", {
        errorCode: "MEETING_OWNER_FORBIDDEN",
      });
    }
    const controllerId = meeting.custodianId ?? meeting.ownerId;
    const currentController = await this.database.query.member.findFirst({
      columns: { id: true },
      where: { organizationId, userId: controllerId },
    });
    if (currentController) {
      throw new ConflictException("会议尚未由 Workspace 托管", {
        errorCode: "MEETING_NOT_CUSTODIED",
      });
    }
    const target = await this.database.query.member.findFirst({
      columns: { id: true },
      where: { organizationId, userId: input.userId },
    });
    if (!target) {
      throw new BadRequestException("目标成员不属于当前 Workspace", {
        errorCode: "MEETING_OWNER_INVALID_MEMBER",
      });
    }
    await this.database
      .update(meetingSession)
      .set({ custodianId: input.userId })
      .where(
        and(eq(meetingSession.id, meetingId), eq(meetingSession.organizationId, organizationId)),
      );
    return { updated: true as const };
  }
}
