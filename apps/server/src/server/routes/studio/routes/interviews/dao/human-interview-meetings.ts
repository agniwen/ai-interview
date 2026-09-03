/* oxlint-disable max-lines -- meeting aggregate reads, writes, and signed-link resolution share persistence invariants. */
import { and, asc, eq, gt, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { uniq } from "lodash-es";
import { buildInterviewCalendarTitle } from "@app/shared/interview-calendar";
import { db } from "../../../../../../lib/server/db/index";
import {
  department,
  jobDescription,
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioHumanInterviewRoundInterviewer,
  studioInterview,
  user,
} from "@app/db-schema/schema";
import type { HumanInterviewMeetingInput } from "@app/db-schema/studio-interviews";
import type { HumanInterviewRecordingJobData } from "@app/meeting-processing-queue/human-interview-recording";
import type {
  HumanInterviewMeetingCandidateLinkRecord,
  HumanInterviewMeetingLinkBundle,
  HumanInterviewMeetingRecord,
  PublicHumanInterviewInterviewerPreview,
  PublicHumanInterviewMeetingPreview,
} from "@app/shared/studio-pipeline-stages";
import {
  HumanInterviewMeetingError,
  buildCandidateInviteToken,
  buildHumanInterviewRoomName,
  buildInterviewerInviteToken,
  buildInviteExpiry,
  hashInviteToken,
  resolveValidUntilInput,
  verifyCandidateInviteToken,
  verifyInterviewerInviteToken,
} from "./human-interview-meeting-access";
import { validateHumanInterviewMeetingInput } from "./human-interview-meeting-input";
import {
  applyHumanInterviewMeetingLifecycleEvent,
  forceEndHumanInterviewMeeting,
} from "./human-interview-meeting-lifecycle";
import { enqueueHumanMeetingEvents } from "../../../../../interview-notifications/utils/events";
import { isInterviewNotificationFlowEnabled } from "../../../../../interview-notifications/utils/feature-flags";

export {
  HumanInterviewMeetingError,
  isHumanInterviewMeetingAfterValidUntil,
  isHumanInterviewMeetingBeforeScheduledStart,
} from "./human-interview-meeting-access";

type MeetingRow = typeof studioHumanInterviewMeeting.$inferSelect;
const serializeDate = (value: Date | null): string | null => value?.toISOString() ?? null;

function toRecord({
  meeting,
  rounds,
  interviewers,
}: {
  meeting: MeetingRow;
  rounds: HumanInterviewMeetingRecord["rounds"];
  interviewers: HumanInterviewMeetingRecord["interviewers"];
}): HumanInterviewMeetingRecord {
  return {
    cancelledAt: serializeDate(meeting.cancelledAt),
    createdAt: serializeDate(meeting.createdAt) ?? new Date().toISOString(),
    createdBy: meeting.createdBy,
    endedAt: serializeDate(meeting.endedAt),
    feishu:
      meeting.feishuProviderId && meeting.feishuSyncStatus
        ? {
            appLink: meeting.feishuAppLink,
            calendarEventUrl: meeting.feishuCalendarEventUrl,
            meetingUrl: meeting.feishuMeetingUrl,
            providerId: meeting.feishuProviderId,
            status: meeting.feishuSyncStatus,
          }
        : null,
    id: meeting.id,
    interviewers,
    lifecycleOccurredAt: serializeDate(meeting.lifecycleOccurredAt),
    lifecycleSource: meeting.lifecycleSource,
    liveKitRoomName: meeting.liveKitRoomName,
    notes: meeting.notes,
    organizationId: meeting.organizationId,
    processingMeetingSessionId: meeting.processingMeetingSessionId,
    recordingDurationMs: meeting.recordingDurationMs,
    recordingEgressId: meeting.recordingEgressId,
    recordingError: meeting.recordingError,
    recordingFileKey: meeting.recordingFileKey,
    recordingSizeBytes: meeting.recordingSizeBytes,
    recordingStatus: meeting.recordingStatus,
    rounds,
    scheduleVersion: meeting.scheduleVersion,
    scheduledAt: serializeDate(meeting.scheduledAt),
    startedAt: serializeDate(meeting.startedAt),
    status: meeting.status,
    title: meeting.title,
    updatedAt: serializeDate(meeting.updatedAt) ?? new Date().toISOString(),
    validUntil: serializeDate(meeting.validUntil),
  };
}

async function hydrateMeetings(meetings: MeetingRow[]): Promise<HumanInterviewMeetingRecord[]> {
  if (meetings.length === 0) {
    return [];
  }

  const meetingIds = meetings.map((m) => m.id);
  const roundRows = await db
    .select({
      candidateInviteExpiresAt: studioHumanInterviewMeetingRound.candidateInviteExpiresAt,
      candidateInviteStatus: studioHumanInterviewMeetingRound.candidateInviteStatus,
      candidateInviteTokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
      candidateName: studioInterview.candidateName,
      interviewRecordId: studioHumanInterviewRound.interviewRecordId,
      joinedAt: studioHumanInterviewMeetingRound.joinedAt,
      label: studioHumanInterviewRound.label,
      leftAt: studioHumanInterviewMeetingRound.leftAt,
      meetingId: studioHumanInterviewMeetingRound.meetingId,
      roundId: studioHumanInterviewMeetingRound.roundId,
      sortOrder: studioHumanInterviewRound.sortOrder,
      status: studioHumanInterviewRound.status,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .where(inArray(studioHumanInterviewMeetingRound.meetingId, meetingIds))
    .orderBy(asc(studioHumanInterviewRound.sortOrder));

  const interviewerRows = await db
    .select({
      image: user.image,
      joinedAt: studioHumanInterviewMeetingInterviewer.joinedAt,
      leftAt: studioHumanInterviewMeetingInterviewer.leftAt,
      meetingId: studioHumanInterviewMeetingInterviewer.meetingId,
      name: user.name,
      role: studioHumanInterviewMeetingInterviewer.role,
      userId: user.id,
    })
    .from(studioHumanInterviewMeetingInterviewer)
    .innerJoin(user, eq(studioHumanInterviewMeetingInterviewer.userId, user.id))
    .where(inArray(studioHumanInterviewMeetingInterviewer.meetingId, meetingIds));

  const roundsByMeeting = new Map<string, HumanInterviewMeetingRecord["rounds"]>();
  for (const row of roundRows) {
    const list = roundsByMeeting.get(row.meetingId) ?? [];
    list.push({
      candidateInviteExpiresAt: serializeDate(row.candidateInviteExpiresAt),
      candidateInviteStatus: row.candidateInviteStatus,
      candidateName: row.candidateName,
      hasCandidateInvite: Boolean(row.candidateInviteTokenHash),
      interviewRecordId: row.interviewRecordId,
      joinedAt: serializeDate(row.joinedAt),
      label: row.label,
      leftAt: serializeDate(row.leftAt),
      roundId: row.roundId,
      sortOrder: row.sortOrder,
      status: row.status,
    });
    roundsByMeeting.set(row.meetingId, list);
  }

  const interviewersByMeeting = new Map<string, HumanInterviewMeetingRecord["interviewers"]>();
  for (const row of interviewerRows) {
    const list = interviewersByMeeting.get(row.meetingId) ?? [];
    list.push({
      id: row.userId,
      image: row.image,
      joinedAt: serializeDate(row.joinedAt),
      leftAt: serializeDate(row.leftAt),
      name: row.name ?? "未命名",
      role: row.role,
    });
    interviewersByMeeting.set(row.meetingId, list);
  }

  return meetings.map((meeting) =>
    toRecord({
      interviewers: interviewersByMeeting.get(meeting.id) ?? [],
      meeting,
      rounds: roundsByMeeting.get(meeting.id) ?? [],
    }),
  );
}

export async function listHumanInterviewMeetings({
  organizationId,
  interviewRecordId,
}: {
  organizationId: string;
  interviewRecordId?: string | null;
}): Promise<HumanInterviewMeetingRecord[]> {
  if (!interviewRecordId) {
    const meetings = await db
      .select()
      .from(studioHumanInterviewMeeting)
      .where(eq(studioHumanInterviewMeeting.organizationId, organizationId))
      .orderBy(
        asc(studioHumanInterviewMeeting.scheduledAt),
        asc(studioHumanInterviewMeeting.createdAt),
      );
    return hydrateMeetings(meetings);
  }

  const rows = await db
    .select({ meetingId: studioHumanInterviewMeetingRound.meetingId })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
    )
    .where(
      and(
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
        eq(studioHumanInterviewRound.interviewRecordId, interviewRecordId),
      ),
    );
  const meetingIds = uniq(rows.map((row) => row.meetingId));
  if (meetingIds.length === 0) {
    return [];
  }
  const meetings = await db
    .select()
    .from(studioHumanInterviewMeeting)
    .where(inArray(studioHumanInterviewMeeting.id, meetingIds))
    .orderBy(
      asc(studioHumanInterviewMeeting.scheduledAt),
      asc(studioHumanInterviewMeeting.createdAt),
    );
  return hydrateMeetings(meetings);
}

export async function loadHumanInterviewMeetingById(
  meetingId: string,
  organizationId: string,
): Promise<HumanInterviewMeetingRecord | null> {
  const [meeting] = await db
    .select()
    .from(studioHumanInterviewMeeting)
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, meetingId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
      ),
    )
    .limit(1);
  const [record] = await hydrateMeetings(meeting ? [meeting] : []);
  return record ?? null;
}

export async function createHumanInterviewMeeting({
  input,
  organizationId,
  createdBy,
  feishuProviderId = null,
}: {
  input: HumanInterviewMeetingInput;
  organizationId: string;
  createdBy: string | null;
  feishuProviderId?: MeetingRow["feishuProviderId"];
}): Promise<HumanInterviewMeetingRecord> {
  const uniqueRoundIds = uniq(input.roundIds);
  const uniqueInterviewerIds = await validateHumanInterviewMeetingInput({
    organizationId,
    roundIds: uniqueRoundIds,
  });

  const existingLinks = await db
    .select({ roundId: studioHumanInterviewMeetingRound.roundId })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
    )
    .where(
      and(
        inArray(studioHumanInterviewMeetingRound.roundId, uniqueRoundIds),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
        ne(studioHumanInterviewMeeting.status, "cancelled"),
      ),
    )
    .limit(1);

  if (existingLinks.length > 0) {
    throw new HumanInterviewMeetingError("该真人复面轮次已关联视频会议。", 400);
  }

  const id = crypto.randomUUID();
  const now = new Date();
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;
  const validUntil = resolveValidUntilInput({
    scheduledAt,
    validUntil: input.validUntil,
  });
  const notificationFlowEnabled = isInterviewNotificationFlowEnabled();
  const candidateInviteExpiresAt = notificationFlowEnabled
    ? new Date(buildInviteExpiry(now.getTime()))
    : null;
  await db.transaction(async (tx) => {
    await tx.insert(studioHumanInterviewMeeting).values({
      createdAt: now,
      createdBy,
      feishuProviderId,
      feishuSyncStatus: feishuProviderId ? "pending" : null,
      id,
      liveKitRoomName: buildHumanInterviewRoomName(id),
      notes: input.notes ?? null,
      organizationId,
      scheduledAt,
      status: "scheduled",
      title: input.title,
      updatedAt: now,
      validUntil,
    });
    await tx.insert(studioHumanInterviewMeetingRound).values(
      uniqueRoundIds.map((roundId) => ({
        candidateInviteExpiresAt,
        candidateInviteTokenHash: candidateInviteExpiresAt
          ? hashInviteToken(
              buildCandidateInviteToken({
                exp: candidateInviteExpiresAt.getTime(),
                meetingId: id,
                roundId,
              }),
            )
          : null,
        meetingId: id,
        roundId,
      })),
    );
    if (uniqueInterviewerIds.length > 0) {
      await tx.insert(studioHumanInterviewMeetingInterviewer).values(
        uniqueInterviewerIds.map((userId, index) => ({
          meetingId: id,
          role: index === 0 ? ("host" as const) : ("interviewer" as const),
          userId,
        })),
      );
      await tx
        .update(studioHumanInterviewRoundInterviewer)
        .set({
          confirmedAt: now,
          confirmedScheduleVersion: 1,
          declineReason: null,
          declinedAt: null,
          status: "confirmed",
        })
        .where(
          and(
            inArray(studioHumanInterviewRoundInterviewer.roundId, uniqueRoundIds),
            inArray(studioHumanInterviewRoundInterviewer.userId, uniqueInterviewerIds),
          ),
        );
    }
    if (notificationFlowEnabled) {
      await enqueueHumanMeetingEvents(tx, {
        actorUserId: createdBy,
        meetingId: id,
        now,
        scheduleVersion: 1,
        type: scheduledAt
          ? "human_candidate_invitation_requested"
          : "human_interview_pending_schedule",
      });
    }
  });

  const created = await loadHumanInterviewMeetingById(id, organizationId);
  if (!created) {
    throw new Error("创建真人复面会议后查询失败");
  }
  return created;
}

export async function issueHumanInterviewMeetingLinks({
  meetingId,
  organizationId,
}: {
  meetingId: string;
  organizationId: string;
}): Promise<HumanInterviewMeetingLinkBundle> {
  const meeting = await loadHumanInterviewMeetingById(meetingId, organizationId);
  if (!meeting) {
    throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
  }

  const rows = await db
    .select({
      candidateInviteExpiresAt: studioHumanInterviewMeetingRound.candidateInviteExpiresAt,
      candidateInviteStatus: studioHumanInterviewMeetingRound.candidateInviteStatus,
      candidateInviteTokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
      candidateName: studioInterview.candidateName,
      interviewRecordId: studioHumanInterviewRound.interviewRecordId,
      label: studioHumanInterviewRound.label,
      roundId: studioHumanInterviewMeetingRound.roundId,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .where(eq(studioHumanInterviewMeetingRound.meetingId, meetingId))
    .orderBy(asc(studioHumanInterviewRound.sortOrder));

  const now = Date.now();
  const candidateLinks: HumanInterviewMeetingCandidateLinkRecord[] = [];
  for (const row of rows) {
    const currentExpiresAt = row.candidateInviteExpiresAt;
    const reusableToken =
      currentExpiresAt && currentExpiresAt.getTime() > now
        ? buildCandidateInviteToken({
            exp: currentExpiresAt.getTime(),
            meetingId,
            roundId: row.roundId,
          })
        : null;
    const shouldReuse = Boolean(
      currentExpiresAt &&
      reusableToken &&
      row.candidateInviteTokenHash === hashInviteToken(reusableToken),
    );
    const expiresAt =
      shouldReuse && currentExpiresAt ? currentExpiresAt : new Date(buildInviteExpiry(now));
    const token =
      shouldReuse && reusableToken
        ? reusableToken
        : buildCandidateInviteToken({
            exp: expiresAt.getTime(),
            meetingId,
            roundId: row.roundId,
          });
    const tokenHash = hashInviteToken(token);

    if (row.candidateInviteTokenHash !== tokenHash || row.candidateInviteExpiresAt !== expiresAt) {
      await db
        .update(studioHumanInterviewMeetingRound)
        .set({
          candidateInviteExpiresAt: expiresAt,
          candidateInviteTokenHash: tokenHash,
        })
        .where(
          and(
            eq(studioHumanInterviewMeetingRound.meetingId, meetingId),
            eq(studioHumanInterviewMeetingRound.roundId, row.roundId),
          ),
        );
    }

    candidateLinks.push({
      candidateName: row.candidateName,
      expiresAt: expiresAt.toISOString(),
      interviewRecordId: row.interviewRecordId,
      roundId: row.roundId,
      roundLabel: row.label,
      url: `/human-interview/${encodeURIComponent(token)}`,
    });
  }

  const interviewerExpiresAt = buildInviteExpiry(now);
  return {
    candidateLinks,
    feishu: meeting.feishu,
    interviewerLinks: meeting.interviewers.map((interviewer) => ({
      name: interviewer.name,
      role: interviewer.role,
      url: `/human-interview/interviewer/${encodeURIComponent(
        buildInterviewerInviteToken({
          exp: interviewerExpiresAt,
          meetingId,
          role: interviewer.role,
          userId: interviewer.id,
        }),
      )}`,
      userId: interviewer.id,
    })),
    meetingId,
    title: meeting.title,
  };
}

export interface HumanInterviewMeetingInviteScope extends PublicHumanInterviewMeetingPreview {
  candidateInviteExpiresAt: string;
  interviewRecordId: string;
  liveKitRoomName: string | null;
  organizationId: string;
  roundId: string;
}

export interface HumanInterviewMeetingInterviewerInviteScope extends PublicHumanInterviewInterviewerPreview {
  jobDescriptionDepartmentName: string | null;
  jobDescriptionName: string | null;
  liveKitRoomName: string | null;
  organizationId: string;
  resumeSkills: string[];
  roundId: string;
  targetRole: string | null;
  userId: string;
}

export async function resolveHumanInterviewMeetingInviteToken(
  inviteToken: string,
): Promise<HumanInterviewMeetingInviteScope | null> {
  const payload = verifyCandidateInviteToken(inviteToken);
  if (!payload) {
    return null;
  }

  const [row] = await db
    .select({
      candidateInviteExpiresAt: studioHumanInterviewMeetingRound.candidateInviteExpiresAt,
      candidateInviteStatus: studioHumanInterviewMeetingRound.candidateInviteStatus,
      candidateInviteTokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
      candidateName: studioInterview.candidateName,
      interviewRecordId: studioHumanInterviewRound.interviewRecordId,
      jobDescriptionName: jobDescription.name,
      liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
      meetingId: studioHumanInterviewMeeting.id,
      organizationId: studioHumanInterviewMeeting.organizationId,
      recordingStatus: studioHumanInterviewMeeting.recordingStatus,
      roundId: studioHumanInterviewRound.id,
      roundLabel: studioHumanInterviewRound.label,
      scheduledAt: studioHumanInterviewMeeting.scheduledAt,
      status: studioHumanInterviewMeeting.status,
      validUntil: studioHumanInterviewMeeting.validUntil,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
    )
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(studioInterview.organizationId, jobDescription.organizationId),
      ),
    )
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.meetingId, payload.meetingId),
        eq(studioHumanInterviewMeetingRound.roundId, payload.roundId),
        eq(studioHumanInterviewMeetingRound.candidateInviteTokenHash, hashInviteToken(inviteToken)),
      ),
    )
    .limit(1);

  if (
    !row ||
    !row.candidateInviteExpiresAt ||
    row.candidateInviteExpiresAt.getTime() < Date.now()
  ) {
    return null;
  }

  return {
    candidateInviteExpiresAt: row.candidateInviteExpiresAt.toISOString(),
    candidateInviteStatus: row.candidateInviteStatus,
    candidateName: row.candidateName,
    interviewRecordId: row.interviewRecordId,
    liveKitRoomName: row.liveKitRoomName,
    meetingId: row.meetingId,
    organizationId: row.organizationId,
    recordingStatus: row.recordingStatus,
    roundId: row.roundId,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    status: row.status,
    title: buildInterviewCalendarTitle([row]),
    validUntil: serializeDate(row.validUntil),
  };
}

export async function resolveHumanInterviewMeetingInterviewerInviteToken(
  inviteToken: string,
): Promise<HumanInterviewMeetingInterviewerInviteScope | null> {
  const payload = verifyInterviewerInviteToken(inviteToken);
  if (!payload) {
    return null;
  }

  const [row] = await db
    .select({
      interviewerName: user.name,
      liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
      meetingId: studioHumanInterviewMeeting.id,
      organizationId: studioHumanInterviewMeeting.organizationId,
      recordingStatus: studioHumanInterviewMeeting.recordingStatus,
      role: studioHumanInterviewMeetingInterviewer.role,
      scheduleVersion: studioHumanInterviewMeeting.scheduleVersion,
      scheduledAt: studioHumanInterviewMeeting.scheduledAt,
      status: studioHumanInterviewMeeting.status,
      userId: studioHumanInterviewMeetingInterviewer.userId,
      validUntil: studioHumanInterviewMeeting.validUntil,
    })
    .from(studioHumanInterviewMeetingInterviewer)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeetingInterviewer.meetingId, studioHumanInterviewMeeting.id),
    )
    .innerJoin(user, eq(studioHumanInterviewMeetingInterviewer.userId, user.id))
    .where(
      and(
        eq(studioHumanInterviewMeetingInterviewer.meetingId, payload.meetingId),
        eq(studioHumanInterviewMeetingInterviewer.userId, payload.userId),
        eq(studioHumanInterviewMeetingInterviewer.role, payload.role),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const contexts = await db
    .select({
      candidateName: studioInterview.candidateName,
      jobDescriptionDepartmentName: department.name,
      jobDescriptionName: jobDescription.name,
      resumeProfile: studioInterview.resumeProfile,
      roundId: studioHumanInterviewRound.id,
      roundLabel: studioHumanInterviewRound.label,
      targetRole: studioInterview.targetRole,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewRound,
      eq(studioHumanInterviewMeetingRound.roundId, studioHumanInterviewRound.id),
    )
    .innerJoin(studioInterview, eq(studioHumanInterviewRound.interviewRecordId, studioInterview.id))
    .leftJoin(
      jobDescription,
      and(
        eq(studioInterview.jobDescriptionId, jobDescription.id),
        eq(studioInterview.organizationId, jobDescription.organizationId),
      ),
    )
    .leftJoin(
      department,
      and(
        eq(jobDescription.departmentId, department.id),
        eq(studioInterview.organizationId, department.organizationId),
      ),
    )
    .where(eq(studioHumanInterviewMeetingRound.meetingId, row.meetingId))
    .orderBy(asc(studioHumanInterviewRound.sortOrder));
  const [context] = contexts;
  if (!context) {
    return null;
  }

  return {
    candidateName: context.candidateName,
    interviewerName: row.interviewerName ?? "未命名",
    jobDescriptionDepartmentName: context.jobDescriptionDepartmentName,
    jobDescriptionName: context.jobDescriptionName,
    liveKitRoomName: row.liveKitRoomName,
    meetingId: row.meetingId,
    organizationId: row.organizationId,
    recordingStatus: row.recordingStatus,
    resumeSkills: context.resumeProfile?.skills ?? [],
    role: row.role,
    roundId: context.roundId,
    roundLabel: context.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    status: row.status,
    targetRole: context.targetRole,
    title: buildInterviewCalendarTitle(contexts),
    userId: row.userId,
    validUntil: serializeDate(row.validUntil),
  };
}

async function loadMeetingIdByRoomName(roomName: string): Promise<string | null> {
  const [meeting] = await db
    .select({ id: studioHumanInterviewMeeting.id })
    .from(studioHumanInterviewMeeting)
    .where(eq(studioHumanInterviewMeeting.liveKitRoomName, roomName))
    .limit(1);
  return meeting?.id ?? null;
}

export interface HumanInterviewRecordingStartClaim {
  candidateIdentity: string;
  meetingId: string;
  organizationId: string;
  roomName: string;
}

const HUMAN_INTERVIEW_RECORDING_START_LEASE_MS = 2 * 60 * 1000;

export async function claimHumanInterviewRecordingStartByRoomName(
  roomName: string,
): Promise<HumanInterviewRecordingStartClaim | null> {
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        id: studioHumanInterviewMeeting.id,
        organizationId: studioHumanInterviewMeeting.organizationId,
        recordingStatus: studioHumanInterviewMeeting.recordingStatus,
        status: studioHumanInterviewMeeting.status,
        updatedAt: studioHumanInterviewMeeting.updatedAt,
      })
      .from(studioHumanInterviewMeeting)
      .where(eq(studioHumanInterviewMeeting.liveKitRoomName, roomName))
      .for("update")
      .limit(1);
    const now = new Date();
    const staleStarting =
      meeting?.recordingStatus === "starting" &&
      meeting.updatedAt.getTime() <= now.getTime() - HUMAN_INTERVIEW_RECORDING_START_LEASE_MS;
    const claimable =
      meeting?.recordingStatus === "pending" ||
      meeting?.recordingStatus === "failed" ||
      staleStarting;
    if (!(meeting && claimable && ["scheduled", "in_progress"].includes(meeting.status))) {
      return null;
    }
    const [candidate, interviewer] = await Promise.all([
      tx
        .select({
          joinedAt: studioHumanInterviewMeetingRound.joinedAt,
          roundId: studioHumanInterviewMeetingRound.roundId,
        })
        .from(studioHumanInterviewMeetingRound)
        .where(
          and(
            eq(studioHumanInterviewMeetingRound.meetingId, meeting.id),
            isNotNull(studioHumanInterviewMeetingRound.joinedAt),
            or(
              isNull(studioHumanInterviewMeetingRound.leftAt),
              gt(
                studioHumanInterviewMeetingRound.joinedAt,
                studioHumanInterviewMeetingRound.leftAt,
              ),
            ),
          ),
        )
        .limit(1),
      tx
        .select({ joinedAt: studioHumanInterviewMeetingInterviewer.joinedAt })
        .from(studioHumanInterviewMeetingInterviewer)
        .where(
          and(
            eq(studioHumanInterviewMeetingInterviewer.meetingId, meeting.id),
            isNotNull(studioHumanInterviewMeetingInterviewer.joinedAt),
            or(
              isNull(studioHumanInterviewMeetingInterviewer.leftAt),
              gt(
                studioHumanInterviewMeetingInterviewer.joinedAt,
                studioHumanInterviewMeetingInterviewer.leftAt,
              ),
            ),
          ),
        )
        .limit(1),
    ]);
    if (!(candidate[0] && interviewer[0])) {
      return null;
    }
    await tx
      .update(studioHumanInterviewMeeting)
      .set({
        candidateRecordingError: null,
        candidateRecordingStatus: "starting",
        recordingError: null,
        recordingStatus: "starting",
        updatedAt: now,
      })
      .where(eq(studioHumanInterviewMeeting.id, meeting.id));
    return {
      candidateIdentity: `candidate_${candidate[0].roundId}`,
      meetingId: meeting.id,
      organizationId: meeting.organizationId,
      roomName,
    };
  });
}

export async function markHumanInterviewRecordingStarted(input: {
  candidateEgressId: string;
  candidateFileKey: string;
  egressId: string;
  fileKey: string;
  meetingId: string;
}): Promise<boolean> {
  const [meeting] = await db
    .update(studioHumanInterviewMeeting)
    .set({
      candidateRecordingEgressId: input.candidateEgressId,
      candidateRecordingError: null,
      candidateRecordingFileKey: input.candidateFileKey,
      candidateRecordingStatus: "active",
      recordingEgressId: input.egressId,
      recordingError: null,
      recordingFileKey: input.fileKey,
      recordingStatus: "active",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, input.meetingId),
        eq(studioHumanInterviewMeeting.recordingStatus, "starting"),
      ),
    )
    .returning({ status: studioHumanInterviewMeeting.status });
  return Boolean(meeting && ["scheduled", "in_progress"].includes(meeting.status));
}

export async function markHumanInterviewRecordingFailed(input: {
  candidateEgressId?: string;
  candidateFileKey?: string;
  egressId?: string;
  error: string;
  fileKey?: string;
  meetingId: string;
}): Promise<void> {
  await db
    .update(studioHumanInterviewMeeting)
    .set({
      candidateRecordingEgressId: input.candidateEgressId,
      candidateRecordingError: input.error,
      candidateRecordingFileKey: input.candidateFileKey,
      candidateRecordingStatus: "failed",
      recordingEgressId: input.egressId,
      recordingError: input.error,
      recordingFileKey: input.fileKey,
      recordingStatus: "failed",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, input.meetingId),
        inArray(studioHumanInterviewMeeting.recordingStatus, ["starting", "active"]),
      ),
    );
}

export async function markHumanInterviewRecordingEgressFailed(input: {
  egressId: string;
  error: string;
  roomName?: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select({
        candidateEgressId: studioHumanInterviewMeeting.candidateRecordingEgressId,
        id: studioHumanInterviewMeeting.id,
      })
      .from(studioHumanInterviewMeeting)
      .where(
        or(
          eq(studioHumanInterviewMeeting.recordingEgressId, input.egressId),
          eq(studioHumanInterviewMeeting.candidateRecordingEgressId, input.egressId),
          input.roomName
            ? and(
                eq(studioHumanInterviewMeeting.liveKitRoomName, input.roomName),
                eq(studioHumanInterviewMeeting.recordingStatus, "starting"),
              )
            : undefined,
        ),
      )
      .for("update")
      .limit(1);
    if (!meeting) {
      return;
    }
    const candidate = meeting.candidateEgressId === input.egressId;
    await tx
      .update(studioHumanInterviewMeeting)
      .set(
        candidate
          ? {
              candidateRecordingEgressId: input.egressId,
              candidateRecordingError: input.error,
              candidateRecordingStatus: "failed",
              recordingError: input.error,
              recordingStatus: "failed",
              updatedAt: new Date(),
            }
          : {
              candidateRecordingError: input.error,
              candidateRecordingStatus: "failed",
              recordingEgressId: input.egressId,
              recordingError: input.error,
              recordingStatus: "failed",
              updatedAt: new Date(),
            },
      )
      .where(eq(studioHumanInterviewMeeting.id, meeting.id));
  });
}

export async function markHumanInterviewRecordingCompleted(input: {
  durationMs: number;
  egressId: string;
  fileKey: string;
  roomName?: string;
  sizeBytes: number;
}): Promise<HumanInterviewRecordingJobData | null> {
  return await db.transaction(async (tx) => {
    const [meeting] = await tx
      .select()
      .from(studioHumanInterviewMeeting)
      .where(
        or(
          eq(studioHumanInterviewMeeting.recordingEgressId, input.egressId),
          eq(studioHumanInterviewMeeting.candidateRecordingEgressId, input.egressId),
          input.roomName
            ? and(
                eq(studioHumanInterviewMeeting.liveKitRoomName, input.roomName),
                eq(studioHumanInterviewMeeting.recordingStatus, "starting"),
              )
            : undefined,
        ),
      )
      .for("update")
      .limit(1);
    if (!meeting) {
      return null;
    }
    const candidate = meeting.candidateRecordingEgressId === input.egressId;
    const [updated] = await tx
      .update(studioHumanInterviewMeeting)
      .set(
        candidate
          ? {
              candidateRecordingDurationMs: input.durationMs,
              candidateRecordingError: null,
              candidateRecordingFileKey: input.fileKey,
              candidateRecordingSizeBytes: input.sizeBytes,
              candidateRecordingStatus: "completed",
              updatedAt: new Date(),
            }
          : {
              recordingDurationMs: input.durationMs,
              recordingEgressId: input.egressId,
              recordingError: null,
              recordingFileKey: input.fileKey,
              recordingSizeBytes: input.sizeBytes,
              recordingStatus:
                meeting.candidateRecordingStatus === "failed" ? "failed" : "completed",
              updatedAt: new Date(),
            },
      )
      .where(eq(studioHumanInterviewMeeting.id, meeting.id))
      .returning();
    if (
      !updated ||
      updated.recordingStatus !== "completed" ||
      updated.candidateRecordingStatus !== "completed" ||
      !updated.recordingDurationMs ||
      !updated.recordingEgressId ||
      !updated.recordingFileKey ||
      !updated.recordingSizeBytes ||
      !updated.candidateRecordingDurationMs ||
      !updated.candidateRecordingEgressId ||
      !updated.candidateRecordingFileKey ||
      !updated.candidateRecordingSizeBytes
    ) {
      return null;
    }
    return {
      candidateDurationMs: updated.candidateRecordingDurationMs,
      candidateEgressId: updated.candidateRecordingEgressId,
      candidateFileKey: updated.candidateRecordingFileKey,
      candidateSizeBytes: updated.candidateRecordingSizeBytes,
      durationMs: updated.recordingDurationMs,
      egressId: updated.recordingEgressId,
      fileKey: updated.recordingFileKey,
      meetingId: updated.id,
      organizationId: updated.organizationId,
      sizeBytes: updated.recordingSizeBytes,
    };
  });
}

export async function loadActiveHumanInterviewRecordingEgressId(
  meetingId: string,
): Promise<string[]> {
  const [meeting] = await db
    .select({
      candidateEgressId: studioHumanInterviewMeeting.candidateRecordingEgressId,
      egressId: studioHumanInterviewMeeting.recordingEgressId,
      tracks: studioHumanInterviewMeeting.recordingTracks,
    })
    .from(studioHumanInterviewMeeting)
    .where(and(eq(studioHumanInterviewMeeting.id, meetingId)))
    .limit(1);
  if (meeting?.tracks) {
    return meeting.tracks.flatMap((track) =>
      track.egressId && ["starting", "active"].includes(track.status) ? [track.egressId] : [],
    );
  }
  return meeting
    ? [meeting.egressId, meeting.candidateEgressId].filter((value): value is string =>
        Boolean(value),
      )
    : [];
}

export async function loadActiveHumanInterviewRecordingByRoomName(
  roomName: string,
): Promise<{ egressIds: string[]; meetingId: string } | null> {
  const [meeting] = await db
    .select({
      candidateEgressId: studioHumanInterviewMeeting.candidateRecordingEgressId,
      egressId: studioHumanInterviewMeeting.recordingEgressId,
      meetingId: studioHumanInterviewMeeting.id,
      tracks: studioHumanInterviewMeeting.recordingTracks,
    })
    .from(studioHumanInterviewMeeting)
    .where(and(eq(studioHumanInterviewMeeting.liveKitRoomName, roomName)))
    .limit(1);
  if (!meeting) {
    return null;
  }
  return {
    egressIds: meeting.tracks
      ? meeting.tracks.flatMap((track) =>
          track.egressId && ["starting", "active"].includes(track.status) ? [track.egressId] : [],
        )
      : [meeting.egressId, meeting.candidateEgressId].filter((value): value is string =>
          Boolean(value),
        ),
    meetingId: meeting.meetingId,
  };
}

export async function markHumanInterviewMeetingInProgress(meetingId: string): Promise<void> {
  await applyHumanInterviewMeetingLifecycleEvent({
    meetingId,
    occurredAt: new Date(),
    provider: "livekit",
    status: "in_progress",
    type: "livekit.manual-start",
  });
}

export async function markHumanInterviewMeetingInProgressByRoomName(
  roomName: string,
): Promise<void> {
  const meetingId = await loadMeetingIdByRoomName(roomName);
  if (meetingId) {
    await markHumanInterviewMeetingInProgress(meetingId);
  }
}

export function endHumanInterviewMeeting({
  meetingId,
  organizationId,
}: {
  meetingId: string;
  organizationId?: string;
}): Promise<string | null> {
  return forceEndHumanInterviewMeeting({ meetingId, organizationId });
}

export async function endHumanInterviewMeetingsByRound({
  roundId,
  organizationId,
}: {
  roundId: string;
  organizationId: string;
}): Promise<(string | null)[]> {
  const meetingRows = await db
    .select({
      id: studioHumanInterviewMeeting.id,
      liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
    })
    .from(studioHumanInterviewMeetingRound)
    .innerJoin(
      studioHumanInterviewMeeting,
      eq(studioHumanInterviewMeetingRound.meetingId, studioHumanInterviewMeeting.id),
    )
    .where(
      and(
        eq(studioHumanInterviewMeetingRound.roundId, roundId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
        inArray(studioHumanInterviewMeeting.status, ["scheduled", "in_progress"]),
      ),
    );
  const meetingIds = uniq(meetingRows.map((meeting) => meeting.id));
  if (meetingIds.length === 0) {
    return [];
  }

  await Promise.all(
    meetingIds.map((meetingId) => forceEndHumanInterviewMeeting({ meetingId, organizationId })),
  );

  return uniq(meetingRows.map((meeting) => meeting.liveKitRoomName));
}

export async function endHumanInterviewMeetingByRoomName(roomName: string): Promise<void> {
  const meetingId = await loadMeetingIdByRoomName(roomName);
  if (meetingId) {
    await applyHumanInterviewMeetingLifecycleEvent({
      meetingId,
      occurredAt: new Date(),
      provider: "livekit",
      status: "ended",
      type: "livekit.room_finished",
    });
  }
}

export async function markHumanInterviewParticipantJoined({
  identity,
  roomName,
}: {
  identity: string;
  roomName: string;
}): Promise<void> {
  const meetingId = await loadMeetingIdByRoomName(roomName);
  if (!meetingId) {
    return;
  }

  const now = new Date();
  if (identity.startsWith("candidate_")) {
    await db
      .update(studioHumanInterviewMeetingRound)
      .set({ joinedAt: now, leftAt: null })
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, meetingId),
          eq(studioHumanInterviewMeetingRound.roundId, identity.slice("candidate_".length)),
        ),
      );
    return;
  }

  if (identity.startsWith("interviewer_")) {
    await db
      .update(studioHumanInterviewMeetingInterviewer)
      .set({ joinedAt: now, leftAt: null })
      .where(
        and(
          eq(studioHumanInterviewMeetingInterviewer.meetingId, meetingId),
          eq(studioHumanInterviewMeetingInterviewer.userId, identity.slice("interviewer_".length)),
        ),
      );
  }
}

export async function markHumanInterviewParticipantLeft({
  identity,
  roomName,
}: {
  identity: string;
  roomName: string;
}): Promise<void> {
  const meetingId = await loadMeetingIdByRoomName(roomName);
  if (!meetingId) {
    return;
  }

  const now = new Date();
  if (identity.startsWith("candidate_")) {
    await db
      .update(studioHumanInterviewMeetingRound)
      .set({ leftAt: now })
      .where(
        and(
          eq(studioHumanInterviewMeetingRound.meetingId, meetingId),
          eq(studioHumanInterviewMeetingRound.roundId, identity.slice("candidate_".length)),
        ),
      );
    return;
  }

  if (identity.startsWith("interviewer_")) {
    await db
      .update(studioHumanInterviewMeetingInterviewer)
      .set({ leftAt: now })
      .where(
        and(
          eq(studioHumanInterviewMeetingInterviewer.meetingId, meetingId),
          eq(studioHumanInterviewMeetingInterviewer.userId, identity.slice("interviewer_".length)),
        ),
      );
  }
}
