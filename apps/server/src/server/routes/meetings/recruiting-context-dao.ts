import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../../../lib/server/db/index";
import { resolveRecruitingVisibilityScopeFromRows } from "../../access/recruiting-visibility";
import type { RecruitingVisibilityScope } from "../../access/recruiting-visibility";
import {
  hasPermissionInStatements,
  normalizePermissionStatements,
} from "@app/shared/permission-statements";
import { roles } from "@app/shared/permissions";
import { z } from "zod";
import {
  jobDescription,
  meetingAuditLog,
  meetingRecruitingContext,
  meetingSession,
  member,
  organizationRole,
  recruitingGroupMember,
  studioInterview,
} from "@app/db-schema/schema";
import type {
  MeetingRecruitingContextLink,
  MeetingRecruitingRecordSummary,
} from "@app/shared/meeting-recording";

const LINKABLE_MEETING_STATUSES = [
  "workspace-verified",
  "processing",
  "processing-failed",
  "ready",
] as const;

type MeetingTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type BuiltInRole = keyof typeof roles;
const permissionJsonSchema = z.json();

function isBuiltInRole(role: string): role is BuiltInRole {
  return Object.hasOwn(roles, role);
}

async function canReadRecruitingRecords(
  tx: MeetingTransaction,
  input: {
    currentMemberships: { groupId: string; role: string }[];
    memberRole: string;
    organizationId: string;
  },
): Promise<boolean> {
  if (input.memberRole === "member") {
    return input.currentMemberships.length > 0;
  }
  if (isBuiltInRole(input.memberRole)) {
    return hasPermissionInStatements(
      normalizePermissionStatements(permissionJsonSchema.parse(roles[input.memberRole].statements)),
      "resumeLibrary",
      "read",
    );
  }
  const [roleRow] = await tx
    .select({ permission: organizationRole.permission })
    .from(organizationRole)
    .where(
      and(
        eq(organizationRole.organizationId, input.organizationId),
        eq(organizationRole.role, input.memberRole),
      ),
    )
    .for("share")
    .limit(1);
  if (!roleRow) {
    return false;
  }
  try {
    return hasPermissionInStatements(
      normalizePermissionStatements(permissionJsonSchema.parse(JSON.parse(roleRow.permission))),
      "resumeLibrary",
      "read",
    );
  } catch {
    return false;
  }
}

function recruitingVisibilityCondition(scope: RecruitingVisibilityScope) {
  if (scope.kind === "none") {
    return eq(studioInterview.id, "");
  }
  if (scope.kind === "restricted") {
    return scope.userIds.length > 0
      ? inArray(studioInterview.createdBy, scope.userIds)
      : eq(studioInterview.id, "");
  }
}

function toRecruitingRecordSummary(row: {
  candidateName: string;
  id: string;
  jobDescriptionName: string | null;
  outcome: string;
  pipelineStage: string;
  targetRole: string | null;
}): MeetingRecruitingRecordSummary {
  return {
    candidateName: row.candidateName,
    id: row.id,
    jobDescriptionName: row.jobDescriptionName,
    outcome: row.outcome,
    pipelineStage: row.pipelineStage,
    targetRole: row.targetRole,
  };
}

const recruitingRecordSelection = {
  candidateName: studioInterview.candidateName,
  id: studioInterview.id,
  jobDescriptionName: jobDescription.name,
  outcome: studioInterview.outcome,
  pipelineStage: studioInterview.pipelineStage,
  targetRole: studioInterview.targetRole,
};

export async function loadMeetingRecruitingContext(input: {
  meetingId: string;
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<MeetingRecruitingContextLink | null> {
  const [row] = await db
    .select({
      ...recruitingRecordSelection,
      linkedAt: meetingRecruitingContext.linkedAt,
      linkedBy: meetingRecruitingContext.linkedBy,
    })
    .from(meetingRecruitingContext)
    .innerJoin(
      meetingSession,
      and(
        eq(meetingSession.id, meetingRecruitingContext.meetingId),
        eq(meetingSession.organizationId, meetingRecruitingContext.organizationId),
      ),
    )
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
        eq(meetingRecruitingContext.meetingId, input.meetingId),
        eq(meetingRecruitingContext.organizationId, input.organizationId),
        recruitingVisibilityCondition(input.visibilityScope),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    linkedAt: row.linkedAt.toISOString(),
    linkedBy: row.linkedBy,
    record: toRecruitingRecordSummary(row),
    templateSuggestion: "recruiting-interview",
  };
}

export async function listMeetingRecruitingRecordCandidates(input: {
  limit: number;
  organizationId: string;
  search?: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<MeetingRecruitingRecordSummary[]> {
  const search = input.search?.trim();
  const searchPattern = search ? `%${search.replaceAll(/[\\%_]/g, "\\$&")}%` : undefined;
  const rows = await db
    .select(recruitingRecordSelection)
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
        eq(studioInterview.organizationId, input.organizationId),
        recruitingVisibilityCondition(input.visibilityScope),
        searchPattern
          ? or(
              ilike(studioInterview.candidateName, searchPattern),
              ilike(studioInterview.targetRole, searchPattern),
              ilike(jobDescription.name, searchPattern),
            )
          : undefined,
      ),
    )
    .orderBy(desc(studioInterview.updatedAt))
    .limit(Math.min(Math.max(input.limit, 1), 50));
  return rows.map(toRecruitingRecordSummary);
}

export async function loadMeetingRecruitingRecordCandidate(input: {
  organizationId: string;
  recruitingRecordId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<MeetingRecruitingRecordSummary | null> {
  const [row] = await db
    .select(recruitingRecordSelection)
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
        eq(studioInterview.id, input.recruitingRecordId),
        eq(studioInterview.organizationId, input.organizationId),
        recruitingVisibilityCondition(input.visibilityScope),
      ),
    )
    .limit(1);
  return row ? toRecruitingRecordSummary(row) : null;
}

async function canActorLinkRecruitingRecord(
  tx: MeetingTransaction,
  input: {
    actorId: string;
    isAdministrator: boolean;
    memberRole: string;
    organizationId: string;
    recruitingRecordId: string;
  },
): Promise<boolean> {
  const currentMemberships = input.isAdministrator
    ? []
    : await tx
        .select({
          groupId: recruitingGroupMember.groupId,
          role: recruitingGroupMember.role,
        })
        .from(recruitingGroupMember)
        .where(
          and(
            eq(recruitingGroupMember.organizationId, input.organizationId),
            eq(recruitingGroupMember.userId, input.actorId),
          ),
        )
        .for("share");
  if (
    !(await canReadRecruitingRecords(tx, {
      currentMemberships,
      memberRole: input.memberRole,
      organizationId: input.organizationId,
    }))
  ) {
    return false;
  }
  const [candidate] = await tx
    .select({ createdBy: studioInterview.createdBy })
    .from(studioInterview)
    .where(
      and(
        eq(studioInterview.id, input.recruitingRecordId),
        eq(studioInterview.organizationId, input.organizationId),
      ),
    )
    .for("share")
    .limit(1);
  if (!candidate) {
    return false;
  }
  const groupRows =
    currentMemberships.length === 0
      ? []
      : await tx
          .select({
            groupId: recruitingGroupMember.groupId,
            role: recruitingGroupMember.role,
            userId: recruitingGroupMember.userId,
          })
          .from(recruitingGroupMember)
          .where(
            and(
              eq(recruitingGroupMember.organizationId, input.organizationId),
              inArray(
                recruitingGroupMember.groupId,
                currentMemberships.map((row) => row.groupId),
              ),
            ),
          )
          .for("share");
  const visibilityScope = resolveRecruitingVisibilityScopeFromRows({
    currentMemberships,
    groupRows,
    memberRole: input.memberRole,
    userId: input.actorId,
  });
  return (
    visibilityScope.kind === "all" ||
    (visibilityScope.kind === "restricted" &&
      Boolean(candidate.createdBy && visibilityScope.userIds.includes(candidate.createdBy)))
  );
}

export async function replaceMeetingRecruitingContext(input: {
  actorId: string;
  meetingId: string;
  organizationId: string;
  recruitingRecordId: string | null;
}): Promise<"forbidden" | "invalid-record" | "not-found" | "unchanged" | "updated"> {
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        custodianId: meetingSession.custodianId,
        id: meetingSession.id,
        ownerId: meetingSession.ownerId,
      })
      .from(meetingSession)
      .where(
        and(
          eq(meetingSession.id, input.meetingId),
          eq(meetingSession.organizationId, input.organizationId),
          inArray(meetingSession.status, [...LINKABLE_MEETING_STATUSES]),
        ),
      )
      .for("update")
      .limit(1);
    if (!meeting) {
      return "not-found";
    }

    const [currentMember] = await tx
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, input.organizationId), eq(member.userId, input.actorId)))
      .for("share")
      .limit(1);
    if (!currentMember) {
      return "forbidden";
    }
    const isAdministrator = currentMember.role === "owner" || currentMember.role === "admin";
    if (!isAdministrator && (meeting.custodianId ?? meeting.ownerId) !== input.actorId) {
      return "forbidden";
    }

    const current = await tx.query.meetingRecruitingContext.findFirst({
      columns: { recruitingRecordId: true },
      where: { meetingId: input.meetingId, organizationId: input.organizationId },
    });
    if (current?.recruitingRecordId === input.recruitingRecordId) {
      return "unchanged";
    }
    if (!(current || input.recruitingRecordId)) {
      return "unchanged";
    }

    if (input.recruitingRecordId) {
      const canLink = await canActorLinkRecruitingRecord(tx, {
        actorId: input.actorId,
        isAdministrator,
        memberRole: currentMember.role,
        organizationId: input.organizationId,
        recruitingRecordId: input.recruitingRecordId,
      });
      if (!canLink) {
        return "invalid-record";
      }
      await tx
        .insert(meetingRecruitingContext)
        .values({
          linkedAt: new Date(),
          linkedBy: input.actorId,
          meetingId: input.meetingId,
          organizationId: input.organizationId,
          recruitingRecordId: input.recruitingRecordId,
        })
        .onConflictDoUpdate({
          set: {
            linkedAt: new Date(),
            linkedBy: input.actorId,
            recruitingRecordId: input.recruitingRecordId,
          },
          target: meetingRecruitingContext.meetingId,
        });
    } else {
      await tx
        .delete(meetingRecruitingContext)
        .where(
          and(
            eq(meetingRecruitingContext.meetingId, input.meetingId),
            eq(meetingRecruitingContext.organizationId, input.organizationId),
          ),
        );
    }

    await tx.insert(meetingAuditLog).values({
      action: "meeting.recruiting_context_changed",
      actorId: input.actorId,
      detail: {
        nextRecruitingRecordId: input.recruitingRecordId,
        previousRecruitingRecordId: current?.recruitingRecordId ?? null,
      },
      id: crypto.randomUUID(),
      meetingId: input.meetingId,
      organizationId: input.organizationId,
    });
    return "updated";
  });
}
