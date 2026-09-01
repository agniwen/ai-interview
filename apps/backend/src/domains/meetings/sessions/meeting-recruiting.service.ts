/* oxlint-disable complexity, no-nested-ternary, require-await, typescript/consistent-type-imports, unicorn/prefer-ternary -- Recruiting state stays transactional; Nest needs MeetingCoreService at runtime. */
import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  jobDescription,
  meetingAuditLog,
  meetingRecruitingContext,
  meetingSession,
  member,
  studioInterview,
} from "@arc/db-schema/schema";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import type { z } from "zod";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import {
  RECRUITING_SCOPE_QUERIES,
  WORKSPACE_AUTHORIZATION_QUERIES,
} from "../../identity-access/public.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import type {
  RecruitingScopeQueries,
  WorkspaceAuthorizationContext,
  WorkspaceAuthorizationQueries,
} from "../../identity-access/public.js";
import { MeetingCoreService } from "./meeting-core.service.js";
import type {
  meetingRecruitingCandidatesQuerySchema,
  updateMeetingRecruitingContextSchema,
} from "./meeting.schemas.js";

const LINKABLE_STATUSES = ["workspace-verified", "processing", "processing-failed", "ready"];
@Injectable()
export class MeetingRecruitingService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_AUTHORIZATION_QUERIES)
    private readonly access: WorkspaceAuthorizationQueries,
    @Inject(RECRUITING_SCOPE_QUERIES)
    private readonly recruitingScope: RecruitingScopeQueries,
    private readonly core: MeetingCoreService,
  ) {}

  private async meeting(context: WorkspaceAuthorizationContext, meetingId: string) {
    const authorized = await this.core.authorized(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      meetingId,
    );
    if (!authorized || !LINKABLE_STATUSES.includes(authorized.meeting.status)) {
      throw new NotFoundException("Meeting Session 不存在", { errorCode: "MEETING_NOT_FOUND" });
    }
    return authorized;
  }

  private async canRead(context: WorkspaceAuthorizationContext) {
    return this.access.authorize(context, { action: "read", resource: "resumeLibrary" });
  }

  private async visibleCreatorIds(
    context: WorkspaceAuthorizationContext,
  ): Promise<string[] | null> {
    return this.recruitingScope.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
  }

  private visibilityCondition(creatorIds: string[] | null) {
    return creatorIds === null
      ? undefined
      : creatorIds.length > 0
        ? inArray(studioInterview.createdBy, creatorIds)
        : eq(studioInterview.id, "");
  }

  private recordSelection() {
    return {
      candidateName: studioInterview.candidateName,
      id: studioInterview.id,
      jobDescriptionName: jobDescription.name,
      outcome: studioInterview.outcome,
      pipelineStage: studioInterview.pipelineStage,
      targetRole: studioInterview.targetRole,
    };
  }

  async get(context: WorkspaceAuthorizationContext, meetingId: string) {
    const authorized = await this.meeting(context, meetingId);
    const canManage =
      authorized.accessRole === "administrator" || authorized.accessRole === "owner";
    if (authorized.accessRole === "administrator") {
      await this.database.insert(meetingAuditLog).values({
        action: "meeting.recruiting_context_accessed",
        actorId: context.actor.id,
        id: randomUUID(),
        meetingId,
        organizationId: context.workspace.id,
      });
    }
    if (!(await this.canRead(context))) {
      return { canManage: false, link: null };
    }
    const creatorIds = await this.visibleCreatorIds(context);
    const [row] = await this.database
      .select({
        ...this.recordSelection(),
        linkedAt: meetingRecruitingContext.linkedAt,
        linkedBy: meetingRecruitingContext.linkedBy,
      })
      .from(meetingRecruitingContext)
      .innerJoin(
        studioInterview,
        and(
          eq(studioInterview.id, meetingRecruitingContext.recruitingRecordId),
          eq(studioInterview.organizationId, meetingRecruitingContext.organizationId),
        ),
      )
      .leftJoin(
        jobDescription,
        and(
          eq(jobDescription.id, studioInterview.jobDescriptionId),
          eq(jobDescription.organizationId, studioInterview.organizationId),
        ),
      )
      .where(
        and(
          eq(meetingRecruitingContext.meetingId, meetingId),
          eq(meetingRecruitingContext.organizationId, context.workspace.id),
          this.visibilityCondition(creatorIds),
        ),
      )
      .limit(1);
    return {
      canManage,
      link: row
        ? {
            linkedAt: row.linkedAt.toISOString(),
            linkedBy: row.linkedBy,
            record: {
              candidateName: row.candidateName,
              id: row.id,
              jobDescriptionName: row.jobDescriptionName,
              outcome: row.outcome,
              pipelineStage: row.pipelineStage,
              targetRole: row.targetRole,
            },
            templateSuggestion: "recruiting-interview" as const,
          }
        : null,
    };
  }

  async candidates(
    context: WorkspaceAuthorizationContext,
    meetingId: string,
    query: z.infer<typeof meetingRecruitingCandidatesQuerySchema>,
  ) {
    const authorized = await this.meeting(context, meetingId);
    if (
      !(await this.canRead(context)) ||
      !(authorized.accessRole === "administrator" || authorized.accessRole === "owner")
    ) {
      throw new ForbiddenException("无权选择招聘记录", {
        errorCode: "MEETING_RECRUITING_CONTEXT_FORBIDDEN",
      });
    }
    const search = query.search?.trim();
    const pattern = search ? `%${search.replaceAll(/[\\%_]/g, "\\$&")}%` : undefined;
    return this.database
      .select(this.recordSelection())
      .from(studioInterview)
      .leftJoin(
        jobDescription,
        and(
          eq(jobDescription.id, studioInterview.jobDescriptionId),
          eq(jobDescription.organizationId, studioInterview.organizationId),
        ),
      )
      .where(
        and(
          eq(studioInterview.organizationId, context.workspace.id),
          this.visibilityCondition(await this.visibleCreatorIds(context)),
          pattern
            ? or(
                ilike(studioInterview.candidateName, pattern),
                ilike(studioInterview.targetRole, pattern),
                ilike(jobDescription.name, pattern),
              )
            : undefined,
        ),
      )
      .orderBy(desc(studioInterview.updatedAt))
      .limit(query.limit);
  }

  async update(
    context: WorkspaceAuthorizationContext,
    meetingId: string,
    input: z.infer<typeof updateMeetingRecruitingContextSchema>,
  ) {
    const authorized = await this.meeting(context, meetingId);
    if (!(authorized.accessRole === "administrator" || authorized.accessRole === "owner")) {
      throw new ForbiddenException("无权修改招聘关联", {
        errorCode: "MEETING_RECRUITING_CONTEXT_FORBIDDEN",
      });
    }
    if (input.recruitingRecordId) {
      if (!(await this.canRead(context))) {
        throw new NotFoundException("招聘记录不存在或无权访问", {
          errorCode: "MEETING_RECRUITING_RECORD_NOT_FOUND",
        });
      }
      const candidate = await this.database.query.studioInterview.findFirst({
        columns: { createdBy: true, id: true },
        where: { id: input.recruitingRecordId, organizationId: context.workspace.id },
      });
      const creatorIds = await this.visibleCreatorIds(context);
      if (
        !candidate ||
        (creatorIds !== null && !candidate.createdBy) ||
        (creatorIds !== null && candidate.createdBy && !creatorIds.includes(candidate.createdBy))
      ) {
        throw new NotFoundException("招聘记录不存在或无权访问", {
          errorCode: "MEETING_RECRUITING_RECORD_NOT_FOUND",
        });
      }
    }
    return this.database.transaction(async (tx) => {
      const [meeting] = await tx
        .select({ custodianId: meetingSession.custodianId, ownerId: meetingSession.ownerId })
        .from(meetingSession)
        .where(
          and(
            eq(meetingSession.id, meetingId),
            eq(meetingSession.organizationId, context.workspace.id),
            inArray(meetingSession.status, LINKABLE_STATUSES),
          ),
        )
        .for("update")
        .limit(1);
      const [currentMember] = await tx
        .select({ role: member.role })
        .from(member)
        .where(
          and(eq(member.organizationId, context.workspace.id), eq(member.userId, context.actor.id)),
        )
        .for("share")
        .limit(1);
      const admin = currentMember?.role === "owner" || currentMember?.role === "admin";
      if (
        !meeting ||
        !currentMember ||
        (!admin && (meeting.custodianId ?? meeting.ownerId) !== context.actor.id)
      ) {
        throw new ForbiddenException("无权修改招聘关联", {
          errorCode: "MEETING_RECRUITING_CONTEXT_FORBIDDEN",
        });
      }
      const current = await tx.query.meetingRecruitingContext.findFirst({
        columns: { recruitingRecordId: true },
        where: { meetingId, organizationId: context.workspace.id },
      });
      if (
        current?.recruitingRecordId === input.recruitingRecordId ||
        !(current || input.recruitingRecordId)
      ) {
        return { state: "unchanged" as const };
      }
      if (input.recruitingRecordId) {
        await tx
          .insert(meetingRecruitingContext)
          .values({
            linkedAt: new Date(),
            linkedBy: context.actor.id,
            meetingId,
            organizationId: context.workspace.id,
            recruitingRecordId: input.recruitingRecordId,
          })
          .onConflictDoUpdate({
            set: {
              linkedAt: new Date(),
              linkedBy: context.actor.id,
              recruitingRecordId: input.recruitingRecordId,
            },
            target: meetingRecruitingContext.meetingId,
          });
      } else {
        await tx
          .delete(meetingRecruitingContext)
          .where(
            and(
              eq(meetingRecruitingContext.meetingId, meetingId),
              eq(meetingRecruitingContext.organizationId, context.workspace.id),
            ),
          );
      }
      await tx.insert(meetingAuditLog).values({
        action: "meeting.recruiting_context_changed",
        actorId: context.actor.id,
        detail: {
          nextRecruitingRecordId: input.recruitingRecordId,
          previousRecruitingRecordId: current?.recruitingRecordId ?? null,
        },
        id: randomUUID(),
        meetingId,
        organizationId: context.workspace.id,
      });
      return { state: "updated" as const };
    });
  }
}
