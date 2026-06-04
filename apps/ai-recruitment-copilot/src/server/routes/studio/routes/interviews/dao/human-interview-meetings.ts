import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/server/db";
import {
  studioHumanInterviewMeeting,
  studioHumanInterviewMeetingInterviewer,
  studioHumanInterviewMeetingRound,
  studioHumanInterviewRound,
  studioInterview,
  user,
} from "@arc/db-schema/schema";
import type { HumanInterviewMeetingInput } from "@arc/db-schema/studio-interviews";
import type {
  HumanInterviewMeetingCandidateLinkRecord,
  HumanInterviewMeetingLinkBundle,
  HumanInterviewMeetingRecord,
  PublicHumanInterviewInterviewerPreview,
  PublicHumanInterviewMeetingPreview,
} from "@/lib/shared/studio-pipeline-stages";

type MeetingRow = typeof studioHumanInterviewMeeting.$inferSelect;
const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EARLY_JOIN_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_VALID_DURATION_MS = 60 * 60 * 1000;

const candidateInvitePayloadSchema = z.object({
  exp: z.number().int().positive(),
  meetingId: z.string().trim().min(1),
  roundId: z.string().trim().min(1),
});

const interviewerInvitePayloadSchema = z.object({
  exp: z.number().int().positive(),
  meetingId: z.string().trim().min(1),
  role: z.enum(["host", "interviewer", "observer"]),
  userId: z.string().trim().min(1),
});

type CandidateInvitePayload = z.infer<typeof candidateInvitePayloadSchema>;
type InterviewerInvitePayload = z.infer<typeof interviewerInvitePayloadSchema>;

export class HumanInterviewMeetingError extends Error {
  readonly status: 400 | 404 | 500;
  constructor(message: string, status: 400 | 404 | 500) {
    super(message);
    this.name = "HumanInterviewMeetingError";
    this.status = status;
  }
}

function serializeDate(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function buildRoomName(meetingId: string): string {
  return `human_${meetingId}_${Math.floor(Math.random() * 10_000)}`;
}

function resolveValidUntilInput({
  scheduledAt,
  validUntil,
  existingValidUntil,
}: {
  scheduledAt: Date | null;
  validUntil: string | null | undefined;
  existingValidUntil?: Date | null;
}): Date | null {
  if (!scheduledAt) {
    return validUntil ? new Date(validUntil) : null;
  }

  let resolved: Date;
  if (validUntil === undefined) {
    resolved = existingValidUntil ?? new Date(scheduledAt.getTime() + DEFAULT_VALID_DURATION_MS);
  } else if (validUntil) {
    resolved = new Date(validUntil);
  } else {
    resolved = new Date(scheduledAt.getTime() + DEFAULT_VALID_DURATION_MS);
  }

  if (Number.isNaN(resolved.getTime())) {
    throw new HumanInterviewMeetingError("请输入有效的有效时间至。", 400);
  }
  if (resolved.getTime() <= scheduledAt.getTime()) {
    throw new HumanInterviewMeetingError("有效时间至必须晚于面试时间。", 400);
  }
  return resolved;
}

function getInviteSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.LIVEKIT_API_SECRET;
  if (!secret) {
    throw new HumanInterviewMeetingError("邀请链接签名密钥未配置。", 500);
  }
  return secret;
}

function signInvitePayload(encodedPayload: string): string {
  return createHmac("sha256", getInviteSecret()).update(encodedPayload).digest("base64url");
}

function buildSignedInviteToken(
  payload: CandidateInvitePayload | InterviewerInvitePayload,
): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
  return `${encodedPayload}.${signInvitePayload(encodedPayload)}`;
}

function buildCandidateInviteToken(payload: CandidateInvitePayload): string {
  return buildSignedInviteToken(payload);
}

function buildInterviewerInviteToken(payload: InterviewerInvitePayload): string {
  return buildSignedInviteToken(payload);
}

function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function decodeSignedInviteToken(token: string): unknown | null {
  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra) {
    return null;
  }

  const expected = signInvitePayload(encodedPayload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
}

function verifyCandidateInviteToken(token: string): CandidateInvitePayload | null {
  const parsed = candidateInvitePayloadSchema.safeParse(decodeSignedInviteToken(token));
  if (!parsed.success || parsed.data.exp < Date.now()) {
    return null;
  }
  return parsed.data;
}

function verifyInterviewerInviteToken(token: string): InterviewerInvitePayload | null {
  const parsed = interviewerInvitePayloadSchema.safeParse(decodeSignedInviteToken(token));
  if (!parsed.success || parsed.data.exp < Date.now()) {
    return null;
  }
  return parsed.data;
}

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
    id: meeting.id,
    interviewers,
    liveKitRoomName: meeting.liveKitRoomName,
    notes: meeting.notes,
    organizationId: meeting.organizationId,
    recordingEgressId: meeting.recordingEgressId,
    recordingFileKey: meeting.recordingFileKey,
    rounds,
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
  const meetingIds = [...new Set(rows.map((row) => row.meetingId))];
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
}: {
  input: HumanInterviewMeetingInput;
  organizationId: string;
  createdBy: string | null;
}): Promise<HumanInterviewMeetingRecord> {
  const uniqueRoundIds = [...new Set(input.roundIds)];
  const uniqueInterviewerIds = [...new Set(input.interviewerIds)];
  const rounds = await db
    .select({
      id: studioHumanInterviewRound.id,
      status: studioHumanInterviewRound.status,
    })
    .from(studioHumanInterviewRound)
    .where(
      and(
        inArray(studioHumanInterviewRound.id, uniqueRoundIds),
        eq(studioHumanInterviewRound.organizationId, organizationId),
      ),
    );

  if (rounds.length !== uniqueRoundIds.length) {
    throw new HumanInterviewMeetingError("存在不属于当前组织的真人复面轮次。", 404);
  }
  if (rounds.some((round) => round.status !== "pending")) {
    throw new HumanInterviewMeetingError("只有待进行的真人复面轮次可以加入会议。", 400);
  }

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
  await db.transaction(async (tx) => {
    await tx.insert(studioHumanInterviewMeeting).values({
      createdAt: now,
      createdBy,
      id,
      liveKitRoomName: buildRoomName(id),
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
        meetingId: id,
        roundId,
      })),
    );
    await tx.insert(studioHumanInterviewMeetingInterviewer).values(
      uniqueInterviewerIds.map((userId, index) => ({
        meetingId: id,
        role: index === 0 ? ("host" as const) : ("interviewer" as const),
        userId,
      })),
    );
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
      shouldReuse && currentExpiresAt ? currentExpiresAt : new Date(now + INVITE_TTL_MS);
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

  const interviewerExpiresAt = now + INVITE_TTL_MS;
  return {
    candidateLinks,
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
  liveKitRoomName: string | null;
  organizationId: string;
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
      candidateInviteTokenHash: studioHumanInterviewMeetingRound.candidateInviteTokenHash,
      candidateName: studioInterview.candidateName,
      interviewRecordId: studioHumanInterviewRound.interviewRecordId,
      liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
      meetingId: studioHumanInterviewMeeting.id,
      organizationId: studioHumanInterviewMeeting.organizationId,
      roundId: studioHumanInterviewRound.id,
      roundLabel: studioHumanInterviewRound.label,
      scheduledAt: studioHumanInterviewMeeting.scheduledAt,
      status: studioHumanInterviewMeeting.status,
      title: studioHumanInterviewMeeting.title,
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
    candidateName: row.candidateName,
    interviewRecordId: row.interviewRecordId,
    liveKitRoomName: row.liveKitRoomName,
    meetingId: row.meetingId,
    organizationId: row.organizationId,
    roundId: row.roundId,
    roundLabel: row.roundLabel,
    scheduledAt: serializeDate(row.scheduledAt),
    status: row.status,
    title: row.title,
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
      role: studioHumanInterviewMeetingInterviewer.role,
      scheduledAt: studioHumanInterviewMeeting.scheduledAt,
      status: studioHumanInterviewMeeting.status,
      title: studioHumanInterviewMeeting.title,
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

  return {
    interviewerName: row.interviewerName ?? "未命名",
    liveKitRoomName: row.liveKitRoomName,
    meetingId: row.meetingId,
    organizationId: row.organizationId,
    role: row.role,
    scheduledAt: serializeDate(row.scheduledAt),
    status: row.status,
    title: row.title,
    userId: row.userId,
    validUntil: serializeDate(row.validUntil),
  };
}

export async function markHumanInterviewMeetingInProgress(meetingId: string): Promise<void> {
  const now = new Date();
  await db
    .update(studioHumanInterviewMeeting)
    .set({ startedAt: now, status: "in_progress", updatedAt: now })
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, meetingId),
        eq(studioHumanInterviewMeeting.status, "scheduled"),
      ),
    );
}

export function isHumanInterviewMeetingBeforeScheduledStart(scheduledAt: string | null): boolean {
  if (!scheduledAt) {
    return false;
  }
  const start = new Date(scheduledAt);
  return !Number.isNaN(start.getTime()) && start.getTime() - EARLY_JOIN_WINDOW_MS > Date.now();
}

export function isHumanInterviewMeetingAfterValidUntil(
  validUntil: string | null,
  nowInput: string | number | Date = Date.now(),
): boolean {
  if (!validUntil) {
    return true;
  }
  const end = new Date(validUntil);
  const now = new Date(nowInput);
  return (
    !Number.isNaN(end.getTime()) && !Number.isNaN(now.getTime()) && end.getTime() < now.getTime()
  );
}

export async function markHumanInterviewMeetingInProgressByRoomName(
  roomName: string,
): Promise<void> {
  const now = new Date();
  await db
    .update(studioHumanInterviewMeeting)
    .set({ startedAt: now, status: "in_progress", updatedAt: now })
    .where(
      and(
        eq(studioHumanInterviewMeeting.liveKitRoomName, roomName),
        eq(studioHumanInterviewMeeting.status, "scheduled"),
      ),
    );
}

export async function endHumanInterviewMeeting({
  meetingId,
  organizationId,
}: {
  meetingId: string;
  organizationId?: string;
}): Promise<string | null> {
  const conditions = [eq(studioHumanInterviewMeeting.id, meetingId)];
  if (organizationId) {
    conditions.push(eq(studioHumanInterviewMeeting.organizationId, organizationId));
  }

  const [meeting] = await db
    .select({ liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName })
    .from(studioHumanInterviewMeeting)
    .where(and(...conditions))
    .limit(1);

  if (!meeting) {
    throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
  }

  const now = new Date();
  await db
    .update(studioHumanInterviewMeeting)
    .set({ endedAt: now, status: "ended", updatedAt: now })
    .where(and(...conditions, ne(studioHumanInterviewMeeting.status, "cancelled")));
  return meeting.liveKitRoomName;
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
  const meetingIds = [...new Set(meetingRows.map((meeting) => meeting.id))];
  if (meetingIds.length === 0) {
    return [];
  }

  const now = new Date();
  await db
    .update(studioHumanInterviewMeeting)
    .set({ endedAt: now, status: "ended", updatedAt: now })
    .where(
      and(
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
        inArray(studioHumanInterviewMeeting.id, meetingIds),
        inArray(studioHumanInterviewMeeting.status, ["scheduled", "in_progress"]),
      ),
    );

  return [...new Set(meetingRows.map((meeting) => meeting.liveKitRoomName))];
}

export async function endHumanInterviewMeetingByRoomName(roomName: string): Promise<void> {
  const now = new Date();
  await db
    .update(studioHumanInterviewMeeting)
    .set({ endedAt: now, status: "ended", updatedAt: now })
    .where(eq(studioHumanInterviewMeeting.liveKitRoomName, roomName));
}

export async function deleteHumanInterviewMeeting({
  meetingId,
  organizationId,
}: {
  meetingId: string;
  organizationId: string;
}): Promise<string | null> {
  const [meeting] = await db
    .select({
      liveKitRoomName: studioHumanInterviewMeeting.liveKitRoomName,
      status: studioHumanInterviewMeeting.status,
    })
    .from(studioHumanInterviewMeeting)
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, meetingId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!meeting) {
    throw new HumanInterviewMeetingError("真人复面会议不存在。", 404);
  }
  if (meeting.status === "in_progress") {
    throw new HumanInterviewMeetingError("进行中的会议不能删除，请先结束会议。", 400);
  }

  const deleted = await db
    .delete(studioHumanInterviewMeeting)
    .where(
      and(
        eq(studioHumanInterviewMeeting.id, meetingId),
        eq(studioHumanInterviewMeeting.organizationId, organizationId),
        ne(studioHumanInterviewMeeting.status, "in_progress"),
      ),
    )
    .returning({ id: studioHumanInterviewMeeting.id });
  if (deleted.length === 0) {
    throw new HumanInterviewMeetingError("进行中的会议不能删除，请先结束会议。", 400);
  }
  return meeting.liveKitRoomName;
}

async function loadMeetingIdByRoomName(roomName: string): Promise<string | null> {
  const [meeting] = await db
    .select({ id: studioHumanInterviewMeeting.id })
    .from(studioHumanInterviewMeeting)
    .where(eq(studioHumanInterviewMeeting.liveKitRoomName, roomName))
    .limit(1);
  return meeting?.id ?? null;
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
      .set({ joinedAt: now })
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
      .set({ joinedAt: now })
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
