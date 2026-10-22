import { lockRecruitingRecord } from "@app/recruiting/records";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../../infrastructure/db/index";
import { collectVisibleCreatorUserIds } from "@app/resume-processing/review/support/access-recruiting-visibility";
import type { RecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import {
  hasPermissionInStatements,
  normalizePermissionStatements,
} from "@app/shared/permission-statements";
import { roles } from "@app/shared/permissions";
import { z } from "zod";
import {
  recruitingEvaluationDocument,
  recruitingInitialInterview,
  jobDescription,
  meetingAuditLog,
  recruitingMeetingContext,
  meetingSession,
  member,
  organizationRole,
  workspaceMemberDottedManager,
  workspaceMemberReporting,
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
    memberRole: string;
    organizationId: string;
  },
): Promise<boolean> {
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
    return eq(recruitingRecordReadModel.id, "");
  }
  if (scope.kind === "restricted") {
    return scope.userIds.length > 0
      ? inArray(recruitingRecordReadModel.createdBy, scope.userIds)
      : eq(recruitingRecordReadModel.id, "");
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
  candidateName: recruitingRecordReadModel.candidateName,
  id: recruitingRecordReadModel.id,
  jobDescriptionName: jobDescription.name,
  outcome: recruitingRecordReadModel.outcome,
  pipelineStage: recruitingRecordReadModel.pipelineStage,
  targetRole: recruitingRecordReadModel.targetRole,
};

export async function loadMeetingRecruitingContext(input: {
  meetingId: string;
  organizationId: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<MeetingRecruitingContextLink | null> {
  const [row] = await db
    .select({
      ...recruitingRecordSelection,
      linkedAt: recruitingMeetingContext.linkedAt,
      linkedBy: recruitingMeetingContext.linkedBy,
    })
    .from(recruitingMeetingContext)
    .innerJoin(
      meetingSession,
      and(
        eq(meetingSession.id, recruitingMeetingContext.meetingId),
        eq(meetingSession.organizationId, recruitingMeetingContext.organizationId),
      ),
    )
    .innerJoin(
      recruitingRecordReadModel,
      and(
        eq(recruitingRecordReadModel.id, recruitingMeetingContext.recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, recruitingMeetingContext.organizationId),
      ),
    )
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .where(
      and(
        eq(recruitingMeetingContext.meetingId, input.meetingId),
        eq(recruitingMeetingContext.organizationId, input.organizationId),
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
  purpose?: "initial-interview";
  limit: number;
  organizationId: string;
  search?: string;
  visibilityScope: RecruitingVisibilityScope;
}): Promise<MeetingRecruitingRecordSummary[]> {
  const search = input.search?.trim();
  const searchPattern = search ? `%${search.replaceAll(/[\\%_]/g, "\\$&")}%` : undefined;
  const rows = await db
    .select(recruitingRecordSelection)
    .from(recruitingRecordReadModel)
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
        recruitingVisibilityCondition(input.visibilityScope),
        input.purpose === "initial-interview"
          ? and(
              inArray(recruitingRecordReadModel.pipelineStage, ["screening", "ai_interview"]),
              eq(recruitingRecordReadModel.outcome, "in_pipeline"),
              sql`not exists (select 1 from ${recruitingEvaluationDocument}
                where ${recruitingEvaluationDocument.recruitingRecordId} = ${recruitingRecordReadModel.id}
                and ${recruitingEvaluationDocument.organizationId} = ${recruitingRecordReadModel.organizationId})`,
              sql`not exists (select 1 from ${recruitingInitialInterview}
                where ${recruitingInitialInterview.recruitingRecordId} = ${recruitingRecordReadModel.id}
                and ${recruitingInitialInterview.organizationId} = ${recruitingRecordReadModel.organizationId})`,
            )
          : undefined,
        searchPattern
          ? or(
              ilike(recruitingRecordReadModel.candidateName, searchPattern),
              ilike(recruitingRecordReadModel.targetRole, searchPattern),
              ilike(jobDescription.name, searchPattern),
            )
          : undefined,
      ),
    )
    .orderBy(desc(recruitingRecordReadModel.updatedAt))
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
    .from(recruitingRecordReadModel)
    .leftJoin(
      jobDescription,
      and(
        eq(jobDescription.id, recruitingRecordReadModel.jobDescriptionId),
        eq(jobDescription.organizationId, recruitingRecordReadModel.organizationId),
      ),
    )
    .where(
      and(
        eq(recruitingRecordReadModel.id, input.recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
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
  if (
    !(await canReadRecruitingRecords(tx, {
      memberRole: input.memberRole,
      organizationId: input.organizationId,
    }))
  ) {
    return false;
  }
  await lockRecruitingRecord(tx, input.recruitingRecordId, input.organizationId);
  const [candidate] = await tx
    .select({ createdBy: recruitingRecordReadModel.createdBy })
    .from(recruitingRecordReadModel)
    .where(
      and(
        eq(recruitingRecordReadModel.id, input.recruitingRecordId),
        eq(recruitingRecordReadModel.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!candidate) {
    return false;
  }
  if (input.isAdministrator) {
    return true;
  }
  const reportingLines = await tx
    .select({
      managerUserId: workspaceMemberReporting.managerUserId,
      shareWithPeers: workspaceMemberReporting.shareWithPeers,
      userId: workspaceMemberReporting.userId,
    })
    .from(workspaceMemberReporting)
    .where(eq(workspaceMemberReporting.organizationId, input.organizationId))
    .for("share");
  const dottedEdges = await tx
    .select({
      managerUserId: workspaceMemberDottedManager.managerUserId,
      userId: workspaceMemberDottedManager.userId,
    })
    .from(workspaceMemberDottedManager)
    .where(eq(workspaceMemberDottedManager.organizationId, input.organizationId))
    .for("share");
  return Boolean(
    candidate.createdBy &&
    collectVisibleCreatorUserIds(input.actorId, reportingLines, dottedEdges).includes(
      candidate.createdBy,
    ),
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

    const current = await tx.query.recruitingMeetingContext.findFirst({
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
        .insert(recruitingMeetingContext)
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
          target: recruitingMeetingContext.meetingId,
        });
    } else {
      await tx
        .delete(recruitingMeetingContext)
        .where(
          and(
            eq(recruitingMeetingContext.meetingId, input.meetingId),
            eq(recruitingMeetingContext.organizationId, input.organizationId),
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
